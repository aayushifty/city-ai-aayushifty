"""Builds real multi-file web projects (websites, 3D websites, small web apps) instead of one-page templates.

Pipeline, all with the citizen's own model (the FreeLLM gateway when it is reachable):

1. requirements: every element the request names becomes a checklist item (each 3D object separately);
2. plan: a static project (HTML pages, CSS, ES-module JS, one module per 3D object, Three.js from a CDN);
3. write every file (independent files in parallel), each told which requirements it must implement and
   to tag them (`// REQ:R3`, `data-req="R3"`, `/* REQ:R3 */`);
4. verify for real: HTML structure, JavaScript syntax (node --check), CSS braces, every local link/import
   resolves, every requirement is implemented where it should be, and 3D objects are genuinely different;
5. repair the failing files with the exact failures (up to 3 rounds);
6. a second citizen reviews the project against the checklist; its issues get one more repair round;
7. publish a copy under data/deliverables/projects/ with a link, and report pass/fail per requirement.

Nothing here runs model output: files are only written inside the task's workspace and checked statically.
"""

from __future__ import annotations

import asyncio
import difflib
import json
import re
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from app.config import config
from app.execution import runtime_check, scene_scaffold, verifier

THREE_VERSION = "0.160.0"
IMPORT_MAP = (
    '<script type="importmap">{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@%s/build/three.module.js", '
    '"three/addons/": "https://cdn.jsdelivr.net/npm/three@%s/examples/jsm/"}}</script>' % (THREE_VERSION, THREE_VERSION)
)
MAX_FILES = 16
MAIN_JS = "js/main.js"
PROFILE_JSON = "content/profile.json"
EXTRAS_JS = "js/scene-extras.js"
MAX_REPAIR_ROUNDS = 3
REQ_KINDS = {"3d_object", "3d_scene", "page", "section", "feature", "interaction", "content", "style"}

ModelFn = Callable[[str, str, bool, int], Awaitable[str]]          # (prompt, system, json_mode, max_tokens) -> text
ProgressFn = Callable[[str, float], Awaitable[None]]


@dataclass
class Requirement:
    id: str
    kind: str
    text: str
    name: str = ""
    status: str = "pending"          # pass / fail
    evidence: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "text": self.text, "name": self.name,
                "status": self.status, "evidence": self.evidence}


@dataclass
class Plan:
    name: str
    summary: str
    files: List[Dict[str, Any]] = field(default_factory=list)     # {"path", "purpose", "requirements": [...]}


def _json(raw: str) -> Optional[Any]:
    text = (raw or "").strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1] if "{" in text else ""):
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


def _file_body(raw: str, path: str) -> str:
    """The file content from a model reply: the largest fenced block, else the whole reply."""
    blocks = re.findall(r"```[\w.+-]*\n([\s\S]*?)```", raw or "")
    body = max(blocks, key=len) if blocks else (raw or "")
    return body.strip("\n") + "\n"


def _slug(text: str, n: int = 40) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:n] or "project"


def _safe_rel(path: str) -> Optional[str]:
    p = (path or "").replace("\\", "/").strip().lstrip("./")
    if not p or p.startswith("/") or ".." in p.split("/") or ":" in p:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_\-./]+", p) or not re.search(r"\.(html|css|js|mjs|json|svg|md|txt)$", p):
        return None
    return p


def wants_profile(text: str) -> bool:
    return bool(re.search(r"portfolio|resume|\bcv\b|personal (?:site|website|page)|about me", text or "", re.IGNORECASE))


def wants_3d(text: str) -> bool:
    return bool(re.search(r"\b3d\b|3-d|three\.?js|webgl|three-dimensional", (text or "").lower()))


class ProjectBuilder:
    def __init__(self, model: ModelFn, reviewer_model: Optional[ModelFn], progress: ProgressFn,
                 note: Callable[[str], None]):
        self.model = model
        self.reviewer_model = reviewer_model
        self.progress = progress
        self.note = note

    # ---- 1. requirements --------------------------------------------------------------------------------

    async def requirements(self, request: str, context: str, three_d: bool,
                           existing: Optional[List[Dict[str, Any]]] = None) -> tuple[str, str, List[Requirement]]:
        prompt = (
            "Turn this request into an explicit, testable requirements checklist for a web project.\n"
            f"REQUEST:\n{request[:4000]}\n"
            + (f"\nCONTEXT (team notes, earlier work, the Governor's instructions):\n{context[:6000]}\n" if context else "")
            + "\nList EVERY distinct element the request names or clearly implies — never merge them:\n"
            "- each 3D object as its own item (kind 3d_object), named after what it is,\n"
            "- the 3D scene itself (kind 3d_scene: camera, lights, controls, animation),\n"
            "- each page (kind page), each section (kind section), each feature or interaction (feature / interaction),\n"
            "- specific content the user asked for (content) and visual style requests (style).\n"
            + ("This is a 3D project: list at least 4 different 3D objects that come from THIS request's own subject "
               "(for a portfolio: things that represent the owner and their work, such as their workspace, tools, skills or "
               "projects), each different in shape. Never use objects that belong to a different topic.\n" if three_d else "")
            + "Give each a short snake_case name. 8 to 24 items.\n"
            'Reply with ONLY JSON: {"project_name": "...", "summary": "one paragraph", '
            '"requirements": [{"id": "R1", "kind": "3d_object", "name": "launch_tower", "text": "What exactly must exist"}]}'
        )
        data = _json(await self.model(prompt, "You are a senior product engineer. You reply with one JSON object.", True, 3000))
        reqs: List[Requirement] = []
        start = 1 + len(existing or [])
        if isinstance(data, dict):
            for item in data.get("requirements") or []:
                if not isinstance(item, dict) or not str(item.get("text") or "").strip():
                    continue
                kind = str(item.get("kind") or "feature").lower().replace(" ", "_").replace("-", "_")
                kind = kind if kind in REQ_KINDS else "feature"
                name = _slug(str(item.get("name") or item.get("text")), 32).replace("-", "_")
                reqs.append(Requirement(id=f"R{start + len(reqs)}", kind=kind, text=str(item["text"])[:300], name=name))
        name = str((data or {}).get("project_name") or "") if isinstance(data, dict) else ""
        summary = str((data or {}).get("summary") or "") if isinstance(data, dict) else ""
        if not reqs and not existing:
            # the model gave nothing usable: a minimal honest checklist from the request itself
            reqs = [Requirement("R1", "page", f"A home page for: {request[:200]}", "home"),
                    Requirement("R2", "style", "Responsive layout that works on phones and desktops", "responsive")]
            if three_d:
                reqs.append(Requirement("R3", "3d_scene", "An interactive Three.js scene", "scene"))
            self.note("The model did not return a requirements list; a minimal checklist was used.")
        # personal sites: everything about the owner lives in one file they can fill in
        if not existing and wants_profile(request):
            reqs.append(Requirement(f"R{start + len(reqs)}", "content",
                                    f"All personal content (name, role, bio, skills, projects, experience, contact links) is "
                                    f"read from {PROFILE_JSON}, so the owner fills in one file", "profile_json"))
        # always: a responsive, navigable result
        if not existing and not any(r.kind == "style" and "responsive" in r.text.lower() for r in reqs):
            reqs.append(Requirement(f"R{start + len(reqs)}", "style", "Responsive layout (phone to desktop)", "responsive"))
        return name or request[:60], summary, reqs[:30]

    # ---- 2. plan ------------------------------------------------------------------------------------------

    async def plan(self, request: str, reqs: List[Requirement], three_d: bool, name: str, summary: str) -> Plan:
        checklist = "\n".join(f"{r.id} [{r.kind}] {r.name}: {r.text}" for r in reqs)
        prompt = (
            f"Plan the file structure of this static web project.\nPROJECT: {name}\n{summary}\n\nREQUIREMENTS:\n{checklist}\n\n"
            "Rules:\n- plain static files only (no build step, no npm): HTML pages, css/, js/ ES modules;\n"
            "- index.html is the home page; put EVERY html page in the project root (tours.html, about.html, ...) "
            "and every page links to the others;\n"
            "- build visuals from code (Three.js geometry, CSS, inline SVG): do not reference image/model/audio files "
            "that are not part of the plan;\n"
            + ("- Three.js comes from a CDN import map ('three' and 'three/addons/'); js/main.js sets up the scene; "
               "EVERY 3d_object gets its own module js/objects/<name>.js exporting a create function;\n" if three_d else "")
            + f"- at most {MAX_FILES} files; assign every requirement id to the file(s) that implement it.\n"
            'Reply with ONLY JSON: {"files": [{"path": "js/objects/rocket.js", "purpose": "...", "requirements": ["R3"]}]}'
        )
        data = _json(await self.model(prompt, "You are a senior web architect. You reply with one JSON object.", True, 3000))
        files: List[Dict[str, Any]] = []
        seen = set()
        for f in (data or {}).get("files", []) if isinstance(data, dict) else []:
            path = _safe_rel(str((f or {}).get("path") or ""))
            if not path or path in seen:
                continue
            seen.add(path)
            ids = [str(x) for x in (f.get("requirements") or []) if any(r.id == str(x) for r in reqs)]
            files.append({"path": path, "purpose": str(f.get("purpose") or "")[:300], "requirements": ids})
        if "index.html" not in seen:
            files.insert(0, {"path": "index.html", "purpose": "Home page", "requirements": []})
        if not any(f["path"].endswith(".css") for f in files):
            files.append({"path": "css/styles.css", "purpose": "Shared styles", "requirements": []})
        if three_d:
            # the scene runner is generated (see scene_scaffold); scene features go to scene-extras.js
            main = next((f for f in files if f["path"] == MAIN_JS), None)
            moved = [rid for rid in (main or {}).get("requirements", [])
                     if not any(r.id == rid and r.kind == "3d_scene" for r in reqs)]
            files = [f for f in files if f["path"] != MAIN_JS]
            files.append({"path": MAIN_JS, "purpose": "Scene runner generated by City AI (renderer, camera, controls, loop)",
                          "requirements": [r.id for r in reqs if r.kind == "3d_scene"], "generated": True})
            extras = next((f for f in files if f["path"] == EXTRAS_JS), None)
            if extras is None:
                extras = {"path": EXTRAS_JS, "purpose": "Custom lighting, effects, animation and interactions for the 3D scene",
                          "requirements": []}
                files.append(extras)
            extras["requirements"] = list(dict.fromkeys(extras["requirements"] + moved))
        # each 3D object gets its own module, so no single element is reused for everything
        for r in reqs:
            if r.kind == "3d_object" and not any(r.id in f["requirements"] and f["path"].startswith("js/objects/") for f in files):
                files.append({"path": f"js/objects/{r.name or r.id.lower()}.js",
                              "purpose": f"Builds the 3D object: {r.text}", "requirements": [r.id]})
        profile_req = next((r for r in reqs if r.name == "profile_json"), None)
        if profile_req:
            prof = next((f for f in files if f["path"] == PROFILE_JSON), None)
            if prof is None:
                prof = {"path": PROFILE_JSON, "purpose": "All personal content of the site owner (sample values to replace)",
                        "requirements": []}
                files.insert(0, prof)
            for f in files:
                if profile_req.id in f["requirements"] and f is not prof:
                    f["requirements"].remove(profile_req.id)
            prof["requirements"] = [profile_req.id]
        # every requirement lives somewhere
        for r in reqs:
            if not any(r.id in f["requirements"] for f in files):
                target = MAIN_JS if r.kind == "3d_scene" and three_d else (
                    "css/styles.css" if r.kind == "style" else "index.html")
                next(f for f in files if f["path"] == target or (target == "css/styles.css" and f["path"].endswith(".css")))[
                    "requirements"].append(r.id)
        return Plan(name=name, summary=summary, files=files[: MAX_FILES + 6])

    # ---- 3. write files -------------------------------------------------------------------------------------

    def _file_prompt(self, plan: Plan, reqs: List[Requirement], f: Dict[str, Any], written: Dict[str, str],
                     three_d: bool, extra: str = "") -> str:
        path = f["path"]
        mine = [r for r in reqs if r.id in f["requirements"]]
        tree = "\n".join(f"- {x['path']}: {x['purpose']}" for x in plan.files)
        others = "\n".join(f"{r.id} [{r.kind}] {r.name}: {r.text}" for r in reqs if r not in mine)
        deps = ""
        if path.endswith(".html"):
            deps = "\n".join(f"- {p}" for p in written)
        elif path == "js/main.js" or path.endswith("main.js"):
            exports = []
            for p, content in written.items():
                if p.startswith("js/") and p != path:
                    names = re.findall(r"export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)", content)
                    exports.append(f"- {p}: exports {', '.join(names) or '(none)'}")
            deps = "\n".join(exports)
        rules = {
            ".html": (f"Valid HTML5. Load styles from the css/ files and the project's JS modules with <script type=\"module\" "
                      "src=\"...\"> (no inline application code). "
                      + ("The page that shows the 3D scene contains <div id=\"scene\"></div> where the 3D view goes and loads "
                         "js/main.js; other pages do not load js/main.js. " if three_d else "")
                      + (f"Put this import map in <head> before any module script: {IMPORT_MAP} " if three_d else "")
                      + "Every page has the same navigation linking all pages. Tag each element that implements a "
                      'requirement with data-req="R<n>". Real, specific content (no lorem ipsum, no fake forms that pretend to send).'),
            ".json": ("content/profile.json: the site owner's personal content as clean JSON with clearly marked SAMPLE values "
                      "they will replace (\"name\": \"Your Name\" ...): name, title, tagline, bio, location, email, photo_url, "
                      "links [{label, url}], skills [], projects [{title, description, tech [], url}], experience "
                      "[{role, company, period, summary}]. No comments (JSON has none)." if path == PROFILE_JSON else
                      "Valid JSON."),
            ".css": "Modern responsive CSS (custom properties, flex/grid, a mobile breakpoint). Mark styles for a requirement with /* REQ:R<n> */.",
            ".js": ("Modern ES module JavaScript. Import Three.js ONLY as `import * as THREE from 'three'` and addons ONLY as "
                    "'three/addons/<real path>' (e.g. three/addons/controls/OrbitControls.js) — never by full URL, and only "
                    "addons that exist in three r160. Every imported name must be exported by the module it comes from. "
                    "Put `// REQ:R<n>` on the line above the code that implements each requirement. "
                    + ("For a 3D object module: export function create<Name>() that builds and returns a THREE.Group with "
                       "group.name set to the object's name, made of several meshes with real geometry that looks like that "
                       "object (distinct from every other object), and optionally export function update(group, time) for its "
                       "animation. Do NOT create a renderer, scene, camera or animation loop: the generated js/main.js adds the "
                       "object to the scene, sizes and places it, and calls update every frame. "
                       if path.startswith("js/objects/") else "")
                    + ("scene-extras.js: export function setup({ THREE, scene, camera, renderer, controls, objects, host }) to add "
                       "lights, effects, labels or interactions to the existing scene (objects = the 3D objects already placed), "
                       "and optionally export function update(time, dt, ctx) for per-frame animation. Do NOT create another "
                       "renderer or scene. " if path == EXTRAS_JS else "")
                    + ("main.js: create renderer, camera, lights, OrbitControls (three/addons/controls/OrbitControls.js), "
                       "a resize handler and an animation loop; import EVERY js/objects/ module and add each object to the "
                       "scene at its own position. It must START ITSELF when loaded (call its setup at the bottom of the "
                       "file) and use element ids that exist on the pages that load it. " if path.endswith("main.js") and three_d else "")),
        }
        rule = rules.get(Path(path).suffix if Path(path).suffix != ".mjs" else ".js", "")
        if any(r.name == "profile_json" for r in reqs) and path.endswith((".js", ".mjs", ".html")) and path != MAIN_JS:
            rule += (f" All personal content (name, bio, skills, projects, experience, links) must come from {PROFILE_JSON} — "
                     f"load it with fetch('{PROFILE_JSON}') (relative to the page) and render it; never hard-code it.")
        return (
            f"PROJECT: {plan.name}\n{plan.summary[:1200]}\n\nALL FILES:\n{tree}\n\n"
            f"WRITE THIS FILE: {path}\nPurpose: {f['purpose']}\n"
            f"Requirements this file must implement:\n" + ("\n".join(f"{r.id} [{r.kind}] {r.name}: {r.text}" for r in mine) or "(supporting file)")
            + (f"\n\nOther requirements (implemented elsewhere, for context):\n{others}" if others else "")
            + (f"\n\nFiles already written:\n{deps}" if deps else "")
            + (f"\n\n{extra}" if extra else "")
            + f"\n\nRules: {rule}\nWrite the COMPLETE file, production quality, no placeholders or TODOs.\n"
            f"Reply with ONLY the file content inside one fenced code block."
        )

    async def write_file(self, plan: Plan, reqs: List[Requirement], f: Dict[str, Any], written: Dict[str, str],
                         three_d: bool, extra: str = "") -> str:
        raw = await self.model(self._file_prompt(plan, reqs, f, written, three_d, extra),
                               "You are an expert front-end and Three.js engineer. You write complete, working files.",
                               False, 8000)
        return _file_body(raw, f["path"])

    async def write_all(self, plan: Plan, reqs: List[Requirement], ws: Path, three_d: bool) -> Dict[str, str]:
        written: Dict[str, str] = {}

        def layer(f: Dict[str, Any]) -> int:
            p = f["path"]
            if p.startswith("js/objects/") or p.endswith(".css") or p.endswith(".json") or p.endswith(".svg"):
                return 0
            if p.endswith((".js", ".mjs")):
                return 1
            return 2

        for level in (0, 1, 2):
            batch = [f for f in plan.files if layer(f) == level and not f.get("generated")]
            if not batch:
                continue
            await self.progress(f"Writing {len(batch)} file(s): {', '.join(f['path'] for f in batch)[:120]}",
                                30.0 + level * 12)
            contents = await asyncio.gather(*(self.write_file(plan, reqs, f, dict(written), three_d) for f in batch),
                                            return_exceptions=True)
            for f, content in zip(batch, contents):
                if isinstance(content, Exception):
                    self.note(f"Writing {f['path']} failed: {content}")
                    content = ""
                written[f["path"]] = content
                out = ws / f["path"]
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(content, encoding="utf-8")
        self.write_scaffold(ws, plan, reqs)
        return written

    def write_scaffold(self, ws: Path, plan: Plan, reqs: List[Requirement]) -> None:
        """(Re)generates js/main.js from the plan: every object module, in plan order."""
        if not any(f.get("generated") and f["path"] == MAIN_JS for f in plan.files):
            return
        objects = []
        for f in plan.files:
            if f["path"].startswith("js/objects/") and (ws / f["path"]).is_file():
                req = next((r for r in reqs if r.id in f["requirements"] and r.kind == "3d_object"), None)
                objects.append({"path": f["path"], "name": req.name if req and req.name else Path(f["path"]).stem})
        extras = (ws / EXTRAS_JS).is_file() and bool((ws / EXTRAS_JS).read_text(encoding="utf-8", errors="replace").strip())
        out = ws / MAIN_JS
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(scene_scaffold.build_main_js(objects, [r.id for r in reqs if r.kind == "3d_scene"], extras),
                       encoding="utf-8")

    # ---- 4. verify ----------------------------------------------------------------------------------------------

    async def verify(self, ws: Path, plan: Plan, reqs: List[Requirement], three_d: bool) -> Dict[str, List[str]]:
        """Returns {path: [problems]} (path '' = project-wide). Also sets each requirement's status/evidence."""
        self.write_scaffold(ws, plan, reqs)
        fixed = fix_relative_links(ws)
        if fixed:
            self.note(f"Corrected {fixed} link(s) that pointed at the right file from the wrong folder.")
        problems: Dict[str, List[str]] = {}
        files = {p.relative_to(ws).as_posix(): p for p in ws.rglob("*") if p.is_file() and ".git" not in p.parts}
        texts = {rel: p.read_text(encoding="utf-8", errors="replace") for rel, p in files.items()
                 if p.suffix in (".html", ".css", ".js", ".mjs", ".json", ".svg", ".md")}

        def add(path: str, msg: str) -> None:
            problems.setdefault(path, []).append(msg)

        node = shutil.which("node")
        for rel, text in texts.items():
            if not text.strip():
                add(rel, "file is empty")
                continue
            if rel.endswith(".html"):
                for issue in verifier.check_html(text):
                    add(rel, issue)
                if three_d and re.search(r"<script[^>]+type=[\"']module", text) and "importmap" not in text:
                    add(rel, "loads ES modules that import 'three' but has no import map in <head>")
            elif rel.endswith(".css"):
                if text.count("{") != text.count("}"):
                    add(rel, f"unbalanced braces ({text.count('{')} opening, {text.count('}')} closing)")
            elif rel.endswith((".js", ".mjs")) and node:
                err = await _node_check(node, text)
                if err:
                    add(rel, f"JavaScript syntax error: {err}")
            elif rel.endswith(".json"):
                for issue in verifier.check_json(text):
                    add(rel, issue)

        # Three.js imports: through the import map, and only files that really exist in the release
        for rel, text in texts.items():
            if not rel.endswith((".html", ".js", ".mjs")):
                continue
            if rel.endswith(".html") and re.search(r"<script[^>]*type=[\"']module[\"'][^>]*>\s*\S", text) and \
                    re.search(r"<script[^>]*type=[\"']module[\"'][^>]*>\s*(import|const|let|function|document|window)", text):
                add(rel, "contains inline application code: move it into a js/ module and load it with <script type=\"module\" src=...>")
            for url in set(re.findall(r"['\"](https://cdn\.jsdelivr\.net/npm/three@[^'\"]+)['\"]", text)):
                if rel.endswith((".js", ".mjs")) or "importmap" not in text[max(0, text.find(url) - 300):text.find(url)]:
                    add(rel, f"imports Three.js by full URL ({url}); use 'three' / 'three/addons/...' through the import map")
            for spec in set(re.findall(r"from\s+['\"](three/addons/[^'\"]+)['\"]|import\s*\(\s*['\"](three/addons/[^'\"]+)['\"]", text)):
                spec = spec[0] or spec[1]
                url = f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/examples/jsm/{spec[len('three/addons/'):]}"
                if await _cdn_exists(url) is False:
                    add(rel, f"imports '{spec}', which does not exist in three r{THREE_VERSION.split('.')[1]}")
            for url in set(re.findall(r"https://cdn\.jsdelivr\.net/npm/three@[^'\"\s)]+\.js", text)):
                if await _cdn_exists(url) is False:
                    add(rel, f"references '{url}', which does not exist on the CDN")

        # every name imported from a project module must really be exported by it
        for rel, text in texts.items():
            if not rel.endswith((".js", ".mjs", ".html")):
                continue
            base = Path(rel).parent
            for names, spec in re.findall(r"import\s*\{([^}]*)\}\s*from\s*['\"](\.{1,2}/[^'\"]+)['\"]", text):
                target = _normalize((base / spec).as_posix())
                if target not in texts:
                    continue                      # reported as a broken link below
                exported = _exports(texts[target])
                wanted = [n.split(" as ")[0].strip() for n in names.split(",") if n.strip()]
                missing = [n for n in wanted if n and n not in exported]
                if missing:
                    add(rel, f"imports {', '.join(missing)} from '{spec}', but {target} only exports: "
                             f"{', '.join(sorted(exported)) or 'nothing'} — use those names (or export the missing ones there)")
            for default_name, spec in re.findall(r"import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['\"](\.{1,2}/[^'\"]+)['\"]", text):
                target = _normalize((base / spec).as_posix())
                if target in texts and "default" not in _exports(texts[target]):
                    add(rel, f"imports a default export ({default_name}) from '{spec}', but {target} has no default export")

        # elements that scripts look up must exist on some page
        all_ids = set()
        for rel, text in texts.items():
            if rel.endswith(".html"):
                all_ids |= set(re.findall(r'\bid\s*=\s*["\']([^"\']+)["\']', text))
        for rel, text in texts.items():
            if rel.endswith((".js", ".mjs")):
                looked_up = set(re.findall(r"getElementById\(\s*['\"]([^'\"]+)['\"]", text)) | set(
                    re.findall(r"querySelector(?:All)?\(\s*['\"]#([\w-]+)['\"]", text))
                missing = sorted(i for i in looked_up if i not in all_ids)
                if missing and any(rel2.endswith(".html") for rel2 in texts):
                    add(rel, "looks up element id(s) that no page has: " + ", ".join(f"#{i}" for i in missing[:6])
                         + " (add the id to the page or use the id that exists)")

        # every local reference resolves
        for rel, text in texts.items():
            base = Path(rel).parent
            refs: List[str] = []
            if rel.endswith(".html"):
                refs += re.findall(r'(?:src|href)\s*=\s*"([^"#?]+)', text)
            if rel.endswith((".js", ".mjs")):
                refs += re.findall(r"(?:import|from)\s*\(?\s*['\"](\.{1,2}/[^'\"]+)['\"]", text)
            if rel.endswith(".css"):
                refs += re.findall(r"url\(\s*['\"]?([^'\")]+)", text)
            for ref in refs:
                if re.match(r"^(https?:|mailto:|tel:|data:|javascript:|//)", ref) or not ref.strip():
                    continue
                target = (base / ref).as_posix()
                target = Path(target).as_posix()
                norm = _normalize(target)
                if norm not in files and not (norm + "/index.html") in files:
                    add(rel, f"broken link: '{ref}' does not exist in the project")
                    if _safe_rel(norm) and norm.endswith((".js", ".mjs", ".css", ".html")):
                        add(norm, f"this file is referenced by {rel} but does not exist yet: write it so that "
                                  f"{rel} works (or it must be removed from {rel})")
            # asset paths in scripts (models, textures, sounds, data) resolve against the page: they must exist too
            if rel.endswith((".js", ".mjs")):
                for ref in re.findall(r"['\"`]((?:\.{1,2}/)?[\w\-./]+\.(?:glb|gltf|obj|fbx|png|jpe?g|webp|gif|svg|hdr|mp3|wav|ogg|json))['\"`]", text):
                    if re.match(r"^(https?:|//)", ref):
                        continue
                    if _normalize(ref) not in files and _normalize((base / ref).as_posix()) not in files:
                        add(rel, f"references the asset '{ref}', which is not in the project (build it from code or add the file)")

        # a file that "tags" most requirements without implementing them is not evidence for any of them
        dumps = {path for path, t in texts.items()
                 if len(reqs) >= 6 and len(set(re.findall(r"\b(R\d+)\b", " ".join(re.findall(r"REQ:\s*R\d+|data-req=[\"'][^\"']*", t)))))
                 >= max(6, len(reqs) * 0.5) and not path.endswith(".html")}
        for path in dumps:
            add(path, "tags most requirements without implementing them: keep REQ tags only next to real implementations")

        # requirements: each one implemented where it should be
        js_texts = {p: t for p, t in texts.items() if p.endswith((".js", ".mjs"))}
        for r in reqs:
            hits = [p for p, t in texts.items() if p not in dumps
                    and re.search(rf"REQ:\s*{r.id}\b|data-req=[\"'][^\"']*\b{r.id}\b", t)]
            if r.kind == "3d_object":
                good = []
                for p in hits:
                    t = js_texts.get(p, "")
                    if t and re.search(r"new\s+THREE\.\w+(Geometry|Mesh|Group)\b|new\s+\w*Geometry\(", t):
                        good.append(p)
                imported = any(re.search(rf"import[^;]*['\"][^'\"]*{re.escape(Path(p).name)}['\"]", t)
                               for p in good for q, t in js_texts.items() if q != p)
                if not good:
                    r.status, r.evidence = "fail", "no module builds this object with Three.js geometry (tag // REQ:%s)" % r.id
                elif not imported:
                    r.status, r.evidence = "fail", f"{good[0]} is never imported, so the object is not in the scene"
                else:
                    r.status, r.evidence = "pass", good[0]
            elif r.kind == "3d_scene":
                scene_files = [p for p in hits if p in js_texts and re.search(r"WebGLRenderer", js_texts[p])
                               and re.search(r"requestAnimationFrame|setAnimationLoop", js_texts[p])]
                r.status, r.evidence = ("pass", scene_files[0]) if scene_files else (
                    "fail", "no tagged module creates a WebGLRenderer with an animation loop")
            elif r.name == "profile_json":
                prof = texts.get(PROFILE_JSON)
                loaders = [p for p, t in texts.items() if p.endswith((".js", ".mjs", ".html")) and "profile.json" in t]
                try:
                    data = json.loads(prof) if prof else None
                except Exception:
                    data = None
                missing = [k for k in ("name", "bio", "projects") if not _has_key(data, k)]
                if prof is None:
                    r.status, r.evidence = "fail", f"{PROFILE_JSON} does not exist"
                elif data is None:
                    r.status, r.evidence = "fail", f"{PROFILE_JSON} is not valid JSON"
                elif missing:
                    r.status, r.evidence = "fail", f"{PROFILE_JSON} has no {', '.join(missing)}"
                elif not loaders:
                    r.status, r.evidence = "fail", f"no page or script loads {PROFILE_JSON} (fetch it and render its content)"
                else:
                    r.status, r.evidence = "pass", f"{PROFILE_JSON} · loaded by {', '.join(loaders[:3])}"
            elif r.kind == "page":
                pages = [p for p in hits if p.endswith(".html")]
                # if the project has a page named for this requirement (tours -> tours.html, home -> index.html), it is that page
                named = [p for p in texts if p.endswith(".html") and _page_matches(r, p)]
                if named and pages and not set(named) & set(pages):
                    r.status, r.evidence = "fail", f"tagged on {pages[0]}, but this is the {named[0]} page: tag it there"
                else:
                    best = next((p for p in named if p in pages), pages[0] if pages else None)
                    r.status, r.evidence = ("pass", best) if best else ("fail", f'no page is tagged data-req="{r.id}"')
            else:
                r.status, r.evidence = ("pass", ", ".join(hits[:3])) if hits else (
                    "fail", f"not found: tag the implementation with REQ:{r.id} / data-req=\"{r.id}\"")
            if r.status == "fail":
                owner = next((f["path"] for f in plan.files if r.id in f["requirements"]), "index.html")
                add(owner, f"requirement {r.id} ({r.name}: {r.text}) — {r.evidence}")

        # run the pages in a real (headless) browser: errors, frames drawn, objects actually in the scene
        static_js_ok = not any("syntax error" in m for ms in problems.values() for m in ms)
        if static_js_ok:
            await self.runtime(ws, reqs, three_d, texts, add)

        # 3D objects must be genuinely different, not one element reused
        objs = {p: re.sub(r"\s+", "", t) for p, t in js_texts.items() if p.startswith("js/objects/")}
        paths = sorted(objs)
        for i, a in enumerate(paths):
            for b in paths[i + 1:]:
                if objs[a] and objs[b] and difflib.SequenceMatcher(None, objs[a][:6000], objs[b][:6000]).quick_ratio() > 0.92 \
                        and difflib.SequenceMatcher(None, objs[a][:6000], objs[b][:6000]).ratio() > 0.9:
                    add(b, f"almost identical to {a}: each 3D object must have its own geometry")
        if three_d and len(paths) >= 2:
            geos = {p: set(re.findall(r"THREE\.(\w+Geometry)", t)) for p, t in js_texts.items() if p.startswith("js/objects/")}
            if len(set().union(*geos.values())) < 3:
                add("", "the 3D objects use fewer than 3 kinds of geometry in total; make them visibly different")
        return problems

    async def runtime(self, ws: Path, reqs: List[Requirement], three_d: bool, texts: Dict[str, str], add) -> None:
        result = await runtime_check.run_pages(ws)
        if not result["available"]:
            if not getattr(self, "_runtime_noted", False):
                self.note(f"Browser check skipped: {result['reason']}.")
                self._runtime_noted = True
            return
        names: List[str] = []
        geometries: set = set()
        rendered = False
        for page, res in result["pages"].items():
            if "error" in res:
                add(page, f"in the browser: {res['error']}")
                continue
            page_rendered = res.get("frames", 0) > 0
            for err in res.get("errors") or []:
                if page_rendered and err.startswith("console.warn"):
                    continue     # a library warning on a page that works is not a failure
                add(_error_owner(err, page, texts), f"in the browser ({page}): {err}")
            scene = res.get("scene") or {}
            if res.get("frames", 0) > 0 and scene.get("meshes", 0) > 0:
                rendered = True
                names += scene.get("names") or []
                geometries |= set(scene.get("geometries") or [])
            elif three_d and _hosts_scene(texts.get(page, "")):
                if not res.get("renderers") and not res.get("frames"):
                    why = ("no THREE.WebGLRenderer was ever created, so the scene setup code never ran"
                           + (" — " + "; ".join(_uncalled_setup(texts)) if _uncalled_setup(texts) else ""))
                elif not res.get("frames"):
                    why = "a renderer was created but renderer.render() was never called (no animation loop)"
                else:
                    why = f"{res.get('frames')} frames were drawn but the scene was empty (nothing added to it)"
                add(page, f"the 3D scene never rendered in the browser: {why}")
        self.last_runtime = {"pages": result["pages"], "rendered": rendered, "names": names[:80], "geometries": sorted(geometries)}
        if not three_d:
            return
        for r in reqs:
            if r.kind == "3d_scene" and r.status == "pass" and not rendered:
                r.status, r.evidence = "fail", "the scene never rendered in the browser"
            if r.kind == "3d_object" and r.status == "pass":
                hit = runtime_check.name_in_scene(r.name, names) if rendered else None
                if hit:
                    r.evidence += f" · rendered as '{hit}'"
                else:
                    r.status = "fail"
                    r.evidence = ("the scene never rendered in the browser" if not rendered else
                                  f"not found in the rendered scene (set group.name = '{r.name}'); objects seen: "
                                  + (", ".join(sorted(set(names))[:12]) or "none named"))
                    owner = next((p for p in texts if p.startswith("js/objects/") and r.name.split("_")[0] in p), "js/main.js")
                    add(owner, f"requirement {r.id} ({r.name}) — {r.evidence}")
        if rendered and len([r for r in reqs if r.kind == "3d_object"]) >= 3 and len(geometries) < 3:
            add("", f"the rendered scene uses only {len(geometries)} kind(s) of geometry ({', '.join(sorted(geometries)) or 'none'}): "
                    "the 3D objects must look different")

    # ---- 5/6. repair and review ------------------------------------------------------------------------------------

    async def repair(self, ws: Path, plan: Plan, reqs: List[Requirement], problems: Dict[str, List[str]],
                     three_d: bool, round_no: int) -> int:
        targets = {p: msgs for p, msgs in problems.items() if p}
        for gen in [f["path"] for f in plan.files if f.get("generated")]:
            if gen in targets:
                moved = targets.pop(gen)
                targets.setdefault(EXTRAS_JS if any(f["path"] == EXTRAS_JS for f in plan.files) else "index.html", []).extend(
                    f"(reported in the generated {gen}, which you cannot edit) {m}" for m in moved)
        if "" in problems:   # project-wide problems go to the object modules / main scene
            for p in [f["path"] for f in plan.files if f["path"].startswith("js/objects/")][:4] or ["index.html"]:
                targets.setdefault(p, []).extend(problems[""])
        written = {f["path"]: (ws / f["path"]).read_text(encoding="utf-8", errors="replace")
                   for f in plan.files if (ws / f["path"]).is_file()}
        jobs = []
        for path, msgs in list(targets.items())[:10]:
            f = next((x for x in plan.files if x["path"] == path), None)
            if f is None:
                if not _safe_rel(path):
                    continue
                f = {"path": path, "purpose": "Referenced by another file", "requirements": []}
                plan.files.append(f)
            current = written.get(path, "")
            extra = (f"REPAIR ROUND {round_no}. This file failed verification:\n" + "\n".join(f"- {m}" for m in msgs[:20])
                     + (f"\n\nCURRENT CONTENT:\n```\n{current[:12000]}\n```" if current else "\n(The file does not exist yet.)")
                     + "\nFix every problem and keep everything else that already works.")
            jobs.append((f, self.write_file(plan, reqs, f, {k: v for k, v in written.items() if k != path}, three_d, extra)))
        results = await asyncio.gather(*(j for _, j in jobs), return_exceptions=True)
        fixed = 0
        for (f, _), content in zip(jobs, results):
            if isinstance(content, Exception) or not str(content).strip():
                self.note(f"Repair of {f['path']} failed: {content if isinstance(content, Exception) else 'empty reply'}")
                continue
            out = ws / f["path"]
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(content, encoding="utf-8")
            fixed += 1
        return fixed

    async def review(self, ws: Path, plan: Plan, reqs: List[Requirement], reviewer_name: str,
                     open_problems: Optional[List[str]] = None) -> Dict[str, Any]:
        if not self.reviewer_model:
            return {"reviewer": None, "approved": None, "issues": []}
        parts, budget = [], 16000
        for f in plan.files:
            p = ws / f["path"]
            if p.is_file() and budget > 0:
                chunk = p.read_text(encoding="utf-8", errors="replace")[:min(2500, budget)]
                budget -= len(chunk)
                parts.append(f"--- {f['path']} ---\n{chunk}")
        checklist = "\n".join(f"{r.id} [{r.kind}] {r.name}: {r.text} -> automated check: {r.status} ({r.evidence})" for r in reqs)
        prompt = (
            f"You are reviewing a teammate's web project before it is delivered.\nPROJECT: {plan.name}\n\n"
            f"REQUIREMENTS AND AUTOMATED CHECKS:\n{checklist}\n\n"
            + (f"PROBLEMS THE AUTOMATED CHECKS STILL REPORT (the project cannot be approved while these remain; "
               f"say how to fix them):\n" + "\n".join(f"- {x}" for x in open_problems[:20]) + "\n\n" if open_problems else "")
            + "FILES (excerpts):\n" + "\n".join(parts)
            + "\n\nCheck that every requirement is really implemented (not just tagged), that 3D objects are distinct and "
            "recognisable, that pages link to each other, and that nothing is placeholder content. Only report real "
            "problems you can point to.\n"
            'Reply with ONLY JSON: {"approved": true, "summary": "one sentence", '
            '"issues": [{"requirement": "R3", "file": "js/objects/rocket.js", "problem": "..."}]}'
        )
        data = _json(await self.reviewer_model(prompt, f"You are {reviewer_name}, a meticulous code reviewer. You reply with one JSON object.", True, 2500))
        if not isinstance(data, dict):
            return {"reviewer": reviewer_name, "approved": None, "issues": [], "summary": "Reviewer reply was not usable."}
        issues = [i for i in (data.get("issues") or []) if isinstance(i, dict) and str(i.get("problem") or "").strip()][:12]
        return {"reviewer": reviewer_name, "approved": bool(data.get("approved")) and not issues and not open_problems,
                "summary": str(data.get("summary") or "")[:400], "issues": issues}

    # ---- the whole pipeline ---------------------------------------------------------------------------------------

    async def build(self, request: str, context: str, ws: Path, reviewer_name: str,
                    revision: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        ws.mkdir(parents=True, exist_ok=True)
        three_d = wants_3d(request + " " + (revision or {}).get("feedback", "")) or bool((revision or {}).get("three_d"))
        if revision:
            prev = [Requirement(**{k: v for k, v in r.items() if k in ("id", "kind", "text", "name")})
                    for r in revision.get("requirements") or []]
            await self.progress("Turning your feedback into checklist items", 12.0)
            _, _, new = await self.requirements(f"CHANGES REQUESTED to the existing project: {revision['feedback']}",
                                                f"Existing requirements:\n" + "\n".join(f"{r.id}: {r.text}" for r in prev),
                                                False, existing=[r.as_dict() for r in prev])
            reqs = prev + new
            plan = Plan(name=revision.get("name") or "Project", summary=revision.get("summary") or "",
                        files=[dict(f) for f in revision.get("files") or []])
            for r in new:      # new items go to a file the model picks, else the home page / main script
                target = await self._pick_file(plan, r, revision["feedback"])
                f = next((x for x in plan.files if x["path"] == target), None)
                if f is None:
                    f = {"path": target, "purpose": f"Implements {r.text}", "requirements": []}
                    plan.files.append(f)
                f["requirements"].append(r.id)
            await self.progress("Applying your changes", 30.0)
            await self.repair(ws, plan, reqs, {f["path"]: [f"apply the Governor's requested change: {revision['feedback'][:600]}"]
                                               for f in plan.files if any(r.id in f["requirements"] for r in new)} or
                              {"index.html": [f"apply the Governor's requested change: {revision['feedback'][:600]}"]},
                              three_d, 0)
        else:
            await self.progress("Listing every element you asked for", 10.0)
            name, summary, reqs = await self.requirements(request, context, three_d)
            await self.progress(f"Planning the project ({len(reqs)} requirements)", 20.0)
            plan = await self.plan(request, reqs, three_d, name, summary)
            await self.write_all(plan, reqs, ws, three_d)

        rounds = 0
        problems = await self.verify(ws, plan, reqs, three_d)
        while problems and rounds < MAX_REPAIR_ROUNDS:
            rounds += 1
            await self.progress(f"Checks failed ({sum(len(v) for v in problems.values())} problems); repair {rounds}/{MAX_REPAIR_ROUNDS}",
                                60.0 + rounds * 7)
            await self.repair(ws, plan, reqs, problems, three_d, rounds)
            problems = await self.verify(ws, plan, reqs, three_d)

        await self.progress(f"{reviewer_name} is reviewing the project", 88.0)
        review = await self.review(ws, plan, reqs, reviewer_name,
                                   [f"{p or 'project'}: {m}" for p, ms in problems.items() for m in ms])
        if review.get("issues"):
            fixes: Dict[str, List[str]] = {}
            for i in review["issues"]:
                path = _safe_rel(str(i.get("file") or "")) or next(
                    (f["path"] for f in plan.files if str(i.get("requirement")) in f["requirements"]), "index.html")
                fixes.setdefault(path, []).append(f"reviewer ({reviewer_name}): {i.get('problem')}")
            await self.progress(f"Fixing {len(review['issues'])} review finding(s)", 92.0)
            await self.repair(ws, plan, reqs, fixes, three_d, rounds + 1)
            problems = await self.verify(ws, plan, reqs, three_d)
            review["fixed_after_review"] = True

        flat = [f"{p or 'project'}: {m}" for p, ms in problems.items() for m in ms]
        passed = sum(1 for r in reqs if r.status == "pass")
        return {
            "verified": not problems,
            "requirements": [r.as_dict() for r in reqs],
            "passed": passed,
            "total": len(reqs),
            "problems": flat,
            "review": review,
            "repair_rounds": rounds,
            "plan": {"name": plan.name, "summary": plan.summary, "files": plan.files},
            "three_d": three_d,
            "runtime": getattr(self, "last_runtime", None),
            "files": sorted(p.relative_to(ws).as_posix() for p in ws.rglob("*") if p.is_file() and ".git" not in p.parts),
        }

    async def _pick_file(self, plan: Plan, r: Requirement, feedback: str) -> str:
        tree = "\n".join(f"- {f['path']}: {f['purpose']}" for f in plan.files)
        raw = await self.model(
            f"Project files:\n{tree}\n\nWhich ONE file should implement this new requirement? {r.id} [{r.kind}] {r.text}\n"
            f"(Change request: {feedback[:500]})\nA new file is fine if none fits (e.g. js/objects/<name>.js for a new 3D object).\n"
            'Reply with ONLY JSON: {"path": "..."}', "You reply with one JSON object.", True, 300)
        data = _json(raw)
        path = _safe_rel(str((data or {}).get("path") or "")) if isinstance(data, dict) else None
        if path:
            return path
        return f"js/objects/{r.name}.js" if r.kind == "3d_object" else "index.html"


def _exports(js: str) -> set:
    """Names a module exports (named, aliased and default)."""
    names = set(re.findall(r"export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+(\w+)", js))
    for group in re.findall(r"export\s*\{([^}]*)\}", js):
        for part in group.split(","):
            part = part.strip()
            if part:
                names.add(part.split(" as ")[-1].strip())
    if re.search(r"export\s+default\b", js):
        names.add("default")
    return names


def _error_owner(err: str, page: str, texts: Dict[str, str]) -> str:
    """The project file a browser error belongs to (the module named in it), else the page."""
    m = (re.search(r"@([\w.\-]+\.m?js):\d+", err) or re.search(r"failed to load <script> \S*/([\w.\-/]+\.m?js)", err)
         or re.search(r"(js/[\w.\-/]+\.m?js):", err))
    if m:
        name = m.group(1)
        owner = next((p for p in texts if p == name or p.endswith("/" + name.split("/")[-1])), None)
        if owner:
            return owner
    return page


def _uncalled_setup(texts: Dict[str, str]) -> List[str]:
    """Exported setup functions (init/setup/start/create...Scene) that no loaded script ever calls."""
    found = []
    for rel, text in texts.items():
        if not rel.endswith((".js", ".mjs")) or rel.startswith("js/objects/"):
            continue
        for name in re.findall(r"export\s+(?:async\s+)?function\s+(\w*(?:init|setup|start|main|run|scene|boot)\w*)\s*\(", text, re.IGNORECASE):
            calls = sum(len(re.findall(rf"(?<![\w.]){name}\s*\(", t)) for t in texts.values())
            if calls <= 1:   # only its own definition
                found.append(f"{rel} exports {name}() but nothing calls it (call it when the module loads)")
    return found[:3]


def _hosts_scene(page_html: str) -> bool:
    """A page that is meant to show the 3D scene: it has a canvas or loads the main scene module."""
    return bool(re.search(r"<canvas|src=[\"'][^\"']*main\.m?js[\"']", page_html or "", re.IGNORECASE))


def _page_matches(r: "Requirement", page: str) -> bool:
    stem = Path(page).stem.lower()
    words = {w for w in re.split(r"[_\-\s]+", (r.name or "").lower()) if len(w) > 2}
    if stem == "index":
        return bool(words & {"home", "landing", "main", "index"})
    return stem in words or any(w in stem for w in words if len(w) > 3)


_CDN_CACHE: Dict[str, Optional[bool]] = {}


async def _cdn_exists(url: str) -> Optional[bool]:
    """True/False when the CDN answers, None when it cannot be reached (then nothing is reported)."""
    if url in _CDN_CACHE:
        return _CDN_CACHE[url]
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.head(url)
        ok: Optional[bool] = resp.status_code < 400 if resp.status_code != 405 else None
    except Exception:
        ok = None
    _CDN_CACHE[url] = ok
    return ok


def fix_relative_links(ws: Path) -> int:
    """Rewrites local links/imports that point at a real project file from the wrong folder (e.g. a page in pages/
    linking 'css/style.css' instead of '../css/style.css'). Purely mechanical: only links whose target exists."""
    import os
    files = {p.relative_to(ws).as_posix() for p in ws.rglob("*") if p.is_file() and ".git" not in p.parts}
    count = 0
    for rel in list(files):
        if not rel.endswith((".html", ".js", ".mjs", ".css")):
            continue
        path = ws / rel
        text = path.read_text(encoding="utf-8", errors="replace")
        base = Path(rel).parent.as_posix()

        def fix(m: re.Match) -> str:
            nonlocal count
            ref = m.group(2)
            if re.match(r"^(https?:|mailto:|tel:|data:|javascript:|//|#)", ref) or not ref.strip():
                return m.group(0)
            if _normalize(f"{base}/{ref}") in files:
                return m.group(0)
            root_target = _normalize(ref)
            if root_target in files and base not in ("", "."):
                count += 1
                new = os.path.relpath(root_target, base).replace("\\", "/")
                if rel.endswith((".js", ".mjs")) and not new.startswith("."):
                    new = "./" + new
                return m.group(1) + new + m.group(3)
            return m.group(0)

        if rel.endswith(".html"):
            new_text = re.sub(r'((?:src|href)\s*=\s*")([^"#?]+)(")', fix, text)
        elif rel.endswith(".css"):
            new_text = re.sub(r"(url\(\s*['\"]?)([^'\")]+)(['\"]?\s*\))", fix, text)
        else:
            new_text = re.sub(r"((?:import|from)\s*\(?\s*['\"])([^'\"]+?\.m?js)(['\"])", fix, text)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
    return count


def _has_key(data: Any, key: str, depth: int = 0) -> bool:
    if depth > 4:
        return False
    if isinstance(data, dict):
        return key in data or any(_has_key(v, key, depth + 1) for v in data.values())
    if isinstance(data, list):
        return any(_has_key(v, key, depth + 1) for v in data[:20])
    return False


def _normalize(path: str) -> str:
    parts: List[str] = []
    for part in path.replace("\\", "/").split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return "/".join(parts)


async def _node_check(node: str, source: str) -> Optional[str]:
    """Syntax-checks an ES module with node --check (nothing is executed)."""
    tmp = Path(tempfile.mkdtemp(prefix="cityai-js-")) / "module.mjs"
    try:
        tmp.write_text(source, encoding="utf-8")
        proc = await asyncio.create_subprocess_exec(node, "--check", str(tmp), stdout=asyncio.subprocess.PIPE,
                                                    stderr=asyncio.subprocess.PIPE)
        try:
            _, err = await asyncio.wait_for(proc.communicate(), timeout=20)
        except asyncio.TimeoutError:
            proc.kill()
            return None
        if proc.returncode == 0:
            return None
        lines = [ln for ln in err.decode("utf-8", "replace").splitlines() if ln.strip()]
        msg = next((ln for ln in lines if "Error" in ln), lines[-1] if lines else "syntax error")
        where = next((ln for ln in lines if "module.mjs:" in ln), "")
        line_no = re.search(r"module\.mjs:(\d+)", where)
        return (msg + (f" (line {line_no.group(1)})" if line_no else ""))[:300]
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)


def publish(ws: Path, name: str, task_id: str) -> tuple[Path, str]:
    """Copies the project to data/deliverables/projects/<slug>-<id>/ (each build/version gets its own folder)."""
    dest = config.DELIVERABLES_DIR / "projects" / f"{_slug(name)}-{task_id[-6:]}-{uuid.uuid4().hex[:4]}"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(ws, dest, ignore=shutil.ignore_patterns(".git", "*.pyc", "__pycache__"))
    return dest, dest.relative_to(config.DELIVERABLES_DIR).as_posix() + "/"
