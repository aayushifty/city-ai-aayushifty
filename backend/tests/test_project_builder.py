"""Real multi-file projects (requirements checklist, plan, files, checks, repair, peer review, publish) and the
FreeLLM gateway provider."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.config import config
from app.execution import project_builder
from app.execution.agent_service import CitizenExecutionService
from app.execution.computer_service import computer_service
from app.execution.task_history import TaskHistory
from app.models.database import Database
from app.models.schemas import CitizenTaskRequest
from app.providers.base import ModelCompletionRequest
from app.providers.freellm_provider import FreeLLMModelProvider, rank_models
from app.providers.router import ModelRouter, model_router
from tests.fake_project import FILES, FakeProjectModel

TASK = CitizenTaskRequest(title="3D website: Lumen space port", description="A 3D website with a rocket, a launch tower and a planet.",
                          expected_deliverable="index.html")


@pytest.fixture
def svc(tmp_path, monkeypatch):
    s = CitizenExecutionService(Database(tmp_path / "city.db"))
    s.workspaces_root = tmp_path / "workspaces"
    s.workspaces_root.mkdir()
    s.history = TaskHistory(tmp_path / "history.json")
    monkeypatch.setattr(config, "DELIVERABLES_DIR", tmp_path / "deliverables")
    monkeypatch.setattr(computer_service, "websites_dir", tmp_path / "deliverables" / "websites")
    return s


async def build(svc, monkeypatch, model, task_id="task-p1"):
    monkeypatch.setattr(model_router, "route_completion", model)
    citizen = svc.get_citizen("agent-webdev")
    result = await svc._run_task_execution_loop(citizen, task_id, TASK)
    return result, svc.history.get(task_id)


def published(url: str) -> Path:
    return config.DELIVERABLES_DIR / url.split("/deliverables/")[1]


@pytest.mark.asyncio
async def test_website_is_built_as_a_verified_multi_file_project(svc, monkeypatch):
    model = FakeProjectModel()
    result, rec = await build(svc, monkeypatch, model)
    assert result["verified"] is True and rec["status"] == "VERIFIED"
    site = published(result["url"])
    assert "/projects/" in result["url"]
    for f in FILES:
        assert (site / f).is_file(), f
    reqs = {r["id"]: r for r in rec["requirements"]}
    assert len(reqs) == 8 and all(r["status"] == "pass" for r in reqs.values())
    assert reqs["R1"]["evidence"] == "js/objects/rocket.js · rendered as 'rocket'"
    assert reqs["R3"]["evidence"] == "js/objects/planet.js · rendered as 'planet'"
    assert rec["review"]["reviewer"] == svc.get_citizen("agent-qa").name and rec["review"]["approved"] is True
    # the template was not used, and the page asks for the requested elements
    assert not (config.DELIVERABLES_DIR / "websites").exists()
    req_prompt = next(c for c in model.calls if "requirements checklist" in c[0])
    assert "each 3D object as its own item" in req_prompt[0] and req_prompt[2] is True, "JSON mode for structured steps"
    assert any("WRITE THIS FILE: js/objects/launch_tower.js" in c[0] for c in model.calls)


@pytest.mark.asyncio
async def test_failing_files_are_repaired_with_the_real_errors(svc, monkeypatch):
    model = FakeProjectModel(broken={"js/objects/rocket.js", "index.html"})
    result, rec = await build(svc, monkeypatch, model)
    assert result["verified"] is True
    assert rec["verification"]["repair_attempts"] >= 1
    repair = next(c[0] for c in model.calls if "REPAIR ROUND 1" in c[0] and "rocket.js" in c[0])
    assert "JavaScript syntax error" in repair, "the repair prompt carries node --check's error"
    assert model.writes["js/objects/rocket.js"] == 2


@pytest.mark.asyncio
async def test_peer_review_findings_are_fixed_before_delivery(svc, monkeypatch):
    model = FakeProjectModel(review_issues=[{"requirement": "R6", "file": "index.html", "problem": "say which days tours run"}])
    result, rec = await build(svc, monkeypatch, model)
    assert result["verified"] is True
    assert rec["review"]["fixed_after_review"] is True and rec["review"]["issues"][0]["requirement"] == "R6"
    assert any("reviewer (" in c[0] and "say which days tours run" in c[0] for c in model.calls)


@pytest.mark.asyncio
async def test_honest_failure_when_the_model_cannot_fix_it(svc, monkeypatch):
    class AlwaysBroken(FakeProjectModel):
        def _write(self, path, repair):
            return super()._write(path, False)
    model = AlwaysBroken(broken={"js/objects/rocket.js"})
    result, rec = await build(svc, monkeypatch, model)
    assert result["verified"] is False and rec["status"] == "FAILED"
    assert "JavaScript syntax error" in rec["verification"]["output"]
    assert rec["verification"]["repair_attempts"] == project_builder.MAX_REPAIR_ROUNDS
    assert result["url"], "the project is still published so you can look at it"


@pytest.mark.asyncio
async def test_checks_catch_reused_objects_unimported_objects_and_broken_links(tmp_path):
    ws = tmp_path / "ws"
    for path, body in FILES.items():
        (ws / path).parent.mkdir(parents=True, exist_ok=True)
        (ws / path).write_text(body.replace("{HEADLINE}", "x"), encoding="utf-8")
    # the planet is a copy of the rocket, the tower is never imported, the about page links to a missing page
    (ws / "js/objects/planet.js").write_text(FILES["js/objects/rocket.js"].replace("R1", "R3").replace("createRocket", "createPlanet"), encoding="utf-8")
    main = FILES["js/main.js"].replace("import { createLaunchTower } from './objects/launch_tower.js';\n", "")
    (ws / "js/main.js").write_text(main.replace("const tower = createLaunchTower(); tower.position.set(1.5, 0, 0); scene.add(tower);\n", ""), encoding="utf-8")
    (ws / "about.html").write_text(FILES["about.html"].replace('href="about.html"', 'href="contact.html"'), encoding="utf-8")

    builder = project_builder.ProjectBuilder(None, None, None, lambda t: None)
    plan = project_builder.Plan("p", "s", [dict(f) for f in json.loads(json.dumps(__import__("tests.fake_project", fromlist=["PLAN"]).PLAN))["files"]])
    reqs = [project_builder.Requirement(**r) for r in __import__("tests.fake_project", fromlist=["REQS"]).REQS]
    problems = await builder.verify(ws, plan, reqs, True)
    flat = " | ".join(m for ms in problems.values() for m in ms)
    dup = next(m for ms in problems.values() for m in ms if "almost identical" in m)
    assert "planet.js" in dup or "rocket.js" in dup, "a copied object is caught"
    assert "contact.html" in flat and "broken link" in flat
    tower = next(r for r in reqs if r.id == "R2")
    assert tower.status == "fail" and "never imported" in tower.evidence
    assert next(r for r in reqs if r.id == "R1").status == "pass"


@pytest.mark.asyncio
async def test_project_revision_adds_the_change_as_a_checked_requirement(svc, monkeypatch):
    model = FakeProjectModel()
    result, rec = await build(svc, monkeypatch, model)
    v1_dir = published(result["url"])
    model.headline = "Your seat to the stars"
    started = svc.revise_task("task-p1", "change the headline to 'Your seat to the stars'")
    await svc._active_tasks[started["task_id"]]
    v2 = svc.history.get(started["task_id"])
    assert v2["status"] == "VERIFIED" and v2["version"] == 2
    new = next(r for r in v2["requirements"] if r["id"] == "R9")
    assert new["status"] == "pass" and new["evidence"] == "index.html"
    v2_url = next(d["url"] for d in v2["deliverables"] if d.get("url"))
    assert v2_url != result["url"]
    assert "Your seat to the stars" in (published(v2_url) / "index.html").read_text(encoding="utf-8")
    assert "Gateway to orbit" in (v1_dir / "index.html").read_text(encoding="utf-8"), "v1 stays as it was"


@pytest.mark.asyncio
async def test_chat_website_request_starts_a_project_build(svc, monkeypatch):
    model = FakeProjectModel()
    monkeypatch.setattr(model_router, "route_completion", model)
    res = await svc.chat_with_citizen("agent-webdev", "Make a 3D website for a space port with a rocket and a planet")
    assert res.action_taken == "PROJECT_STARTED" and "checklist" in res.reply
    rec = next(r for r in svc.history.list() if r["kind"] == "TASK")
    await svc._active_tasks[rec["task_id"]]
    rec = svc.history.get(rec["task_id"])
    assert rec["status"] == "VERIFIED" and rec["three_d"] is True


# --- FreeLLM gateway ---------------------------------------------------------------------------------------------

def gateway(models=("meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free", "text-embedding-3-small"),
            status=200, seen=None, needs_key=(), rate_limited=()):
    """A fake FreeLLM gateway: models in needs_key are listed but unusable; rate_limited ones answer 429."""
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.headers.get("authorization") != "Bearer test-key":
            return httpx.Response(401, json={"error": {"message": "Invalid API key"}})
        if request.url.path.endswith("/models"):
            return httpx.Response(status, json={"data": [
                {"id": m, "available": m not in needs_key, "execution_status": "needsKey" if m in needs_key else "ready"}
                for m in models]})
        body = json.loads(request.content)
        if body["model"] in rate_limited or body["model"] in needs_key:
            return httpx.Response(429 if body["model"] in rate_limited else 503, json={"error": {"message": "unavailable"}})
        text = body["messages"][-1]["content"]
        content = '{"ok": true}' if '{"ok": true}' in text else f"hello from {body['model']}"
        return httpx.Response(200, json={"id": "c1", "choices": [{"message": {"content": content}}],
                                         "usage": {"prompt_tokens": 3, "completion_tokens": 4}})
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_freellm_lists_models_ranks_them_and_chats():
    seen = []
    p = FreeLLMModelProvider(api_key="test-key", base_url="http://gw/v1", transport=gateway(seen=seen))
    assert await p.is_available() is True
    assert await p.list_models() == ["meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free", "text-embedding-3-small"]
    assert p.best_model(coding=True) == "qwen/qwen3-coder:free"
    assert p.best_model(coding=False) == "meta-llama/llama-3.3-70b-instruct:free"
    resp = await p.generate(ModelCompletionRequest(prompt="hi"))
    assert resp.content == "hello from meta-llama/llama-3.3-70b-instruct:free" and resp.provider_name == "freellm"
    assert seen[-1].url.path == "/v1/chat/completions"
    assert p.status()["model_count"] == 3 and "test-key" not in json.dumps(p.status())


@pytest.mark.asyncio
async def test_freellm_without_a_valid_key_is_not_used():
    assert await FreeLLMModelProvider(api_key=None, base_url="http://gw/v1", transport=gateway()).is_available() is False
    bad = FreeLLMModelProvider(api_key="wrong", base_url="http://gw/v1", transport=gateway())
    assert await bad.is_available() is False and "FREELLM_API_KEY" in bad.status()["error"]


def test_embedding_and_audio_models_are_never_picked():
    assert rank_models(["text-embedding-3-large", "whisper-1", "tts-1", "gpt-4o-mini"]) == ["gpt-4o-mini"]


@pytest.mark.asyncio
async def test_citizens_move_to_the_gateway_and_back_and_pins_are_kept(svc, monkeypatch):
    p = FreeLLMModelProvider(api_key="test-key", base_url="http://gw/v1", transport=gateway())
    monkeypatch.setitem(model_router._providers, "freellm", p)
    svc.get_citizen("agent-doctor").model_pinned = True
    await svc.sync_providers(force=True)
    eng, an, doc = svc.get_citizen("agent-engineer"), svc.get_citizen("agent-analyst"), svc.get_citizen("agent-doctor")
    assert (eng.provider_key, eng.assigned_model) == ("freellm", "qwen/qwen3-coder:free")
    assert (an.provider_key, an.assigned_model) == ("freellm", "meta-llama/llama-3.3-70b-instruct:free")
    assert doc.provider_key == "ollama", "a model you picked by hand is left alone"

    p.api_key = None                                   # gateway gone (key removed / daemon stopped)
    await svc.sync_providers(force=True)
    assert (eng.provider_key, eng.assigned_model) == ("ollama", "qwen2.5-coder:7b")


@pytest.mark.asyncio
async def test_router_falls_back_to_the_citizens_own_local_model():
    class Broken:
        provider_name = "freellm"
        async def is_available(self): return True
        async def generate(self, req): raise httpx.ConnectError("gateway down")

    class Local:
        provider_name = "ollama"
        async def is_available(self): return True
        async def generate(self, req):
            return SimpleNamespace(content="ok", model_name=req.model_name, provider_name="ollama", is_fallback=False)

    r = ModelRouter()
    r._providers = {"freellm": Broken(), "ollama": Local()}
    resp = await r.route_completion(ModelCompletionRequest(prompt="x", model_name="qwen/qwen3-coder:free"),
                                    preferred_provider="freellm", fallback_models={"ollama": "qwen2.5-coder:7b"})
    assert resp.provider_name == "ollama" and resp.model_name == "qwen2.5-coder:7b" and resp.is_fallback is True


# --- lessons from a live build: wrong-folder links, tag dumps, missing assets, reviewer vs. failed checks ---------

def write_project(ws, overrides=None):
    for path, body in {**FILES, **(overrides or {})}.items():
        (ws / path).parent.mkdir(parents=True, exist_ok=True)
        (ws / path).write_text(body.replace("{HEADLINE}", "x"), encoding="utf-8")


def fake_plan_and_reqs():
    from tests import fake_project
    plan = project_builder.Plan("p", "s", [dict(f) for f in json.loads(json.dumps(fake_project.PLAN))["files"]])
    reqs = [project_builder.Requirement(**r) for r in fake_project.REQS] + [
        project_builder.Requirement("R8", "style", "Responsive layout", "responsive")]
    return plan, reqs


@pytest.mark.asyncio
async def test_links_from_a_subfolder_page_are_corrected_mechanically(tmp_path):
    ws = tmp_path / "ws"
    sub = FILES["about.html"].replace('<html lang="en">', '<html lang="en">')
    write_project(ws)
    (ws / "about.html").unlink()
    (ws / "pages").mkdir()
    (ws / "pages/about.html").write_text(sub, encoding="utf-8")       # still links css/styles.css, index.html
    (ws / "index.html").write_text(FILES["index.html"].replace("{HEADLINE}", "x").replace('href="about.html"', 'href="pages/about.html"'), encoding="utf-8")
    notes = []
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, notes.append).verify(ws, plan, reqs, True)
    page = (ws / "pages/about.html").read_text(encoding="utf-8")
    assert 'href="../css/styles.css"' in page and 'href="../index.html"' in page
    assert not any("broken link" in m for ms in problems.values() for m in ms)
    assert notes and "Corrected" in notes[0]


@pytest.mark.asyncio
async def test_a_file_that_only_tags_requirements_is_not_evidence(tmp_path):
    ws = tmp_path / "ws"
    dump = "\n".join(f"// REQ:R{i}\nexport const X{i} = 'assets/models/thing{i}.glb';" for i in range(1, 9))
    write_project(ws, {"js/utils/paths.js": dump})
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    msgs = problems["js/utils/paths.js"]
    assert any("tags most requirements" in m for m in msgs)
    assert any("assets/models/thing1.glb" in m and "not in the project" in m for m in msgs)
    assert all("paths.js" not in r.evidence for r in reqs)


@pytest.mark.asyncio
async def test_reviewer_cannot_approve_while_checks_fail(tmp_path):
    async def reviewer(prompt, system, json_mode, max_tokens):
        assert "PROBLEMS THE AUTOMATED CHECKS STILL REPORT" in prompt and "broken link" in prompt
        return json.dumps({"approved": True, "summary": "looks fine", "issues": []})
    ws = tmp_path / "ws"
    write_project(ws)
    plan, reqs = fake_plan_and_reqs()
    review = await project_builder.ProjectBuilder(None, reviewer, None, lambda t: None).review(
        ws, plan, reqs, "QA", open_problems=["about.html: broken link: 'x.html' does not exist in the project"])
    assert review["approved"] is False



# --- the pages are run in a (headless) browser ---------------------------------------------------------------------

@pytest.mark.asyncio
async def test_a_scene_that_never_renders_is_a_failure(tmp_path, browser):
    ws = tmp_path / "ws"
    write_project(ws)
    browser.per_page["index.html"] = {"errors": ["Uncaught SyntaxError: The requested module './objects/rocket.js' does not provide an export named 'Rocket'"],
                                      "frames": 0, "scene": None, "canvases": [], "text": 300, "title": "x"}
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    msgs = " | ".join(problems["index.html"])
    assert "does not provide an export named 'Rocket'" in msgs and "never rendered in the browser: no THREE.WebGLRenderer was ever created" in msgs
    # about.html rendered nothing 3D on purpose (no import map) and is not blamed for it
    assert "about.html" not in problems


@pytest.mark.asyncio
async def test_an_object_missing_from_the_rendered_scene_fails(tmp_path, browser):
    ws = tmp_path / "ws"
    write_project(ws)
    browser.names = ["rocket", "planet"]                      # the tower was built but never made it into the scene
    plan, reqs = fake_plan_and_reqs()
    await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    tower = next(r for r in reqs if r.id == "R2")
    assert tower.status == "fail" and "not found in the rendered scene" in tower.evidence and "group.name = 'launch_tower'" in tower.evidence
    assert next(r for r in reqs if r.id == "R1").status == "pass"


@pytest.mark.asyncio
async def test_one_geometry_reused_for_everything_is_caught_at_runtime(tmp_path, browser):
    ws = tmp_path / "ws"
    write_project(ws)
    browser.geometries = ["BoxGeometry"]
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    assert any("only 1 kind(s) of geometry" in m for m in problems[""])


@pytest.mark.asyncio
async def test_without_a_browser_the_static_checks_still_run_and_it_is_noted(tmp_path, browser):
    ws = tmp_path / "ws"
    write_project(ws)
    browser.available = False
    notes = []
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, notes.append).verify(ws, plan, reqs, True)
    assert not problems and any("Browser check skipped" in n for n in notes)


@pytest.mark.asyncio
async def test_threejs_import_rules(tmp_path):
    ws = tmp_path / "ws"
    bad_main = FILES["js/main.js"].replace("import * as THREE from 'three';",
        "import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';\n"
        "import { Environment } from 'three/addons/objects/Environment.js';")
    bad_index = FILES["index.html"].replace('<script type="module" src="js/main.js"></script>',
                                            '<script type="module">import { createRocket } from "./js/objects/rocket.js";</script>')
    write_project(ws, {"js/main.js": bad_main, "index.html": bad_index})
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    main = " | ".join(problems["js/main.js"])
    assert "by full URL" in main and "three/addons/objects/Environment.js', which does not exist" in main
    assert any("inline application code" in m for m in problems["index.html"])


@pytest.mark.asyncio
async def test_page_requirements_must_be_on_their_own_page_and_only_scene_pages_must_render(tmp_path, browser):
    ws = tmp_path / "ws"
    tours = FILES["about.html"].replace('data-req="R7"', 'data-req="R9"').replace("About the port", "Daily tours")
    write_project(ws, {"tours.html": tours})
    plan, reqs = fake_plan_and_reqs()
    reqs.append(project_builder.Requirement("R9", "page", "A tours page", "tours_page"))
    reqs.append(project_builder.Requirement("R10", "page", "An about page", "about_page"))
    (ws / "about.html").write_text(FILES["about.html"].replace('data-req="R7"', 'data-req="R7 R10"'), encoding="utf-8")
    # the tours page has no 3D scene of its own: it must not be blamed for not rendering one
    browser.per_page["tours.html"] = {"errors": [], "frames": 0, "scene": None, "canvases": [], "text": 200, "title": "t"}
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    assert next(r for r in reqs if r.id == "R9").status == "pass"
    assert next(r for r in reqs if r.id == "R10").status == "pass"
    assert "tours.html" not in problems

    (ws / "tours.html").write_text(FILES["about.html"].replace('data-req="R7"', 'data-req="R7"'), encoding="utf-8")
    (ws / "about.html").write_text(FILES["about.html"].replace('data-req="R7"', 'data-req="R7 R9 R10"'), encoding="utf-8")
    await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    r9 = next(r for r in reqs if r.id == "R9")
    assert r9.status == "fail" and "this is the tours.html page" in r9.evidence



@pytest.mark.asyncio
async def test_only_models_that_really_answer_are_chosen_and_failover_works():
    models = ("gpt-5-mini", "qwen3.5-397b", "gemini-3.5-flash", "llama-3.3-70b", "auto")
    p = FreeLLMModelProvider(api_key="test-key", base_url="http://gw/v1",
                             transport=gateway(models=models, needs_key=("gpt-5-mini",), rate_limited=("qwen3.5-397b",)))
    # listed but needs a key upstream: never chosen; rate-limited during the test: not in the chain
    chain = await p.choose(coding=False)
    assert "gpt-5-mini" not in chain and "qwen3.5-397b" not in chain and "auto" not in chain
    assert chain[0] == "gemini-3.5-flash" and "llama-3.3-70b" in chain
    # a call to a model that is rate-limited right now moves on to the next tested one
    resp = await p.generate(ModelCompletionRequest(prompt="hi", model_name="qwen3.5-397b"))
    assert resp.content == "hello from gemini-3.5-flash" and p.last_used == "gemini-3.5-flash"
    st = p.status()
    assert st["ready_count"] == 4 and st["model_count"] == 5 and st["general_chain"] == chain


@pytest.mark.asyncio
async def test_a_dead_scene_gets_a_precise_cause(tmp_path, browser):
    ws = tmp_path / "ws"
    main = FILES["js/main.js"].replace("const canvas = document.getElementById('scene');",
                                       "const canvas = document.getElementById('viewport');")
    main = main.replace("// REQ:R4", "// REQ:R4\nexport function initScene() {}")
    write_project(ws, {"js/main.js": main})
    browser.per_page["index.html"] = {"errors": [], "frames": 0, "renderers": 0, "scene": None, "canvases": [], "text": 300, "title": "x"}
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    assert any("no THREE.WebGLRenderer was ever created" in m and "exports initScene() but nothing calls it" in m
               for m in problems["index.html"])
    assert any("#viewport" in m and "no page has" in m for m in problems["js/main.js"])


@pytest.mark.asyncio
async def test_imports_must_match_exports_and_browser_errors_go_to_the_module(tmp_path, browser):
    ws = tmp_path / "ws"
    main = FILES["js/main.js"].replace("import { createPlanet } from './objects/planet.js';",
                                       "import { createRingedPlanet } from './objects/planet.js';")
    write_project(ws, {"js/main.js": main})
    browser.per_page["index.html"] = {"errors": ["Uncaught SyntaxError: The requested module './objects/planet.js' does not provide an export named 'createRingedPlanet' @main.js:5"],
                                      "frames": 0, "renderers": 0, "scene": None, "canvases": [], "text": 300, "title": "x"}
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    main_msgs = " | ".join(problems["js/main.js"])
    assert "imports createRingedPlanet from './objects/planet.js', but js/objects/planet.js only exports: createPlanet" in main_msgs
    assert "in the browser (index.html): Uncaught SyntaxError" in main_msgs, "the error is repaired where it happens"


@pytest.mark.asyncio
async def test_gateway_backs_off_when_every_model_is_rate_limited(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "a", "available": True, "execution_status": "ready"}]})
        calls.append(1)
        if len(calls) <= 2:          # the probe passes later; the first real call is rate-limited
            if len(calls) == 1:
                return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})
            return httpx.Response(429, headers={"retry-after": "1"}, json={"error": {"message": "slow down"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "done"}}], "usage": {}})

    from app.providers import freellm_provider
    slept = []

    async def fake_sleep(s):
        slept.append(s)
    monkeypatch.setattr(freellm_provider.asyncio, "sleep", fake_sleep)
    p = FreeLLMModelProvider(api_key="test-key", base_url="http://gw/v1", transport=httpx.MockTransport(handler))
    assert await p.choose(False) == ["a"]
    resp = await p.generate(ModelCompletionRequest(prompt="hi", model_name="a"))
    assert resp.content == "done" and slept and slept[0] >= 1


# --- portfolios: recognized as websites, one profile file, no fake design files ----------------------------------

def test_portfolios_and_web_apps_are_websites_but_stock_portfolios_are_not():
    from app.execution.agent_service import _is_web_request, _mission_web_kind
    assert _mission_web_kind("make an interactive 3d portfolio for me") == "WEBSITE"
    assert _is_web_request("build a web app for todo lists") and _is_web_request("personal site with a blog")
    assert not _is_web_request("Analyze my stock portfolio risk")
    assert not _is_web_request("Build a construction site safety report")
    assert _mission_web_kind("Build a todo app that saves items") == "WEBSITE"
    assert _mission_web_kind("an app that tracks my reading list") == "WEBSITE"
    assert _mission_web_kind("Write a market analysis of app stores") is None


def test_fake_binary_and_sentence_files_are_refused(svc):
    from app.execution.workspace import WorkspaceManager
    ws = svc.workspaces_root / "w"
    ws.mkdir()
    written = []
    svc.history.start("task-f", "agent-designer", "Rihan", "Design", kind="TASK")
    svc._write_files(WorkspaceManager(ws), [
        {"path": "figma_prototype.fig", "content": "This is a Figma prototype file, which cannot be represented as text."},
        {"path": "portfolio_backend/ repo with headless CMS (Sanity/Strapi), admin UI", "content": "x"},
        {"path": "design_system.md", "content": "# Design system"}], written, "task-f")
    assert [p.name for p in written] == ["design_system.md"]
    notes = " | ".join(svc.history.get("task-f")["notes"])
    assert "would be a fake file" in notes and "a description, not a file name" in notes


@pytest.mark.asyncio
async def test_text_pretending_to_be_a_pdf_fails_and_failures_come_first(tmp_path):
    from app.execution import verifier
    (tmp_path / "storyboard.pdf").write_text("This is a storyboard; PDFs cannot be text.", encoding="utf-8")
    (tmp_path / "notes.md").write_text("# ok", encoding="utf-8")
    ev = await verifier.verify_deliverables(tmp_path, [tmp_path / "notes.md", tmp_path / "storyboard.pdf"])
    assert ev.exit_code != 0
    assert ev.output_snippet.startswith("FAIL storyboard.pdf [format]: not a real .pdf file")


@pytest.mark.asyncio
async def test_same_test_file_name_in_two_folders_does_not_break_pytest(tmp_path):
    from app.execution import verifier
    for folder in (tmp_path, tmp_path / "frontend"):
        folder.mkdir(exist_ok=True)
        (folder / "test_spec.py").write_text("def test_ok():\n    assert True\n", encoding="utf-8")
    code, out = await verifier.run_pytest(tmp_path)
    assert code == 0, out


@pytest.mark.asyncio
async def test_portfolio_gets_one_profile_file_that_the_site_loads(tmp_path):
    reqs_model = FakeProjectModel()
    from types import SimpleNamespace

    async def model(prompt, system, json_mode, max_tokens):
        return (await reqs_model(SimpleNamespace(prompt=prompt, json_mode=json_mode))).content
    b = project_builder.ProjectBuilder(model, None, None, lambda t: None)
    name, summary, reqs = await b.requirements("an interactive 3D portfolio for me", "", True)
    prof = next(r for r in reqs if r.name == "profile_json")
    plan = await b.plan("portfolio", reqs, True, name, summary)
    assert any(f["path"] == "content/profile.json" and f["requirements"] == [prof.id] for f in plan.files)
    prompt = b._file_prompt(plan, reqs, next(f for f in plan.files if f["path"] == "index.html"), {}, True)
    assert "fetch('content/profile.json')" in prompt

    ws = tmp_path / "ws"
    write_project(ws, {"content/profile.json": json.dumps({"name": "Your Name", "bio": "Sample bio", "projects": []}),
                       "js/objects/rocket.js": FILES["js/objects/rocket.js"].replace("// REQ:R1", "// REQ:R1\nfetch('content/profile.json');")})
    await b.verify(ws, plan, reqs, True)
    assert prof.status == "pass" and "loaded by" in prof.evidence
    (ws / "content/profile.json").write_text("{not json", encoding="utf-8")
    await b.verify(ws, plan, reqs, True)
    assert prof.status == "fail" and "not valid JSON" in prof.evidence


def test_profile_keys_may_be_nested_and_prompts_carry_no_foreign_example_objects():
    assert project_builder._has_key({"personal": {"name": "Your Name", "bio": "x"}, "projects": []}, "name")
    assert not project_builder._has_key({"personal": {"title": "x"}}, "bio")
    import inspect
    src = inspect.getsource(project_builder.ProjectBuilder.requirements)
    assert "rocket" not in src and "launch tower" not in src


def test_missing_imports_flags_uninstalled_packages_only(tmp_path):
    from app.execution.tools import _missing_imports
    (tmp_path / "models.py").write_text("")
    src = "import os, json\nimport flask_never_installed_xyz\nfrom fastapi import FastAPI\nfrom models import Todo\nfrom . import x\n"
    assert _missing_imports(src, tmp_path) == ["flask_never_installed_xyz"]


@pytest.mark.asyncio
async def test_api_calls_and_form_field_names_must_match_the_server_and_the_page(tmp_path):
    ws = tmp_path / "ws"
    server = project_builder.SERVER_TEMPLATE
    app_js = ("const API_BASE = '/api';\n"
              "fetch(`${API_BASE}/items/todos`); fetch(`/api/items/todos/${id}`, {method: 'PUT'});\n"
              "fetch(`${API_BASE}/tasks`); fetch('/api/auth/login', {method: 'POST'});\n"
              "const pw = form.querySelector('input[name=\"confirm-password\"]').value;\n"
              "const email = form.elements.email.value;\n")
    page = FILES["index.html"].replace("{HEADLINE}", "x").replace(
        "</body>", '<form><input name="email"><input name="confirmPassword"></form><script src="js/app.js"></script></body>')
    write_project(ws, {"server.py": server, "js/app.js": app_js, "index.html": page})
    plan, reqs = fake_plan_and_reqs()
    problems = await project_builder.ProjectBuilder(None, None, None, lambda t: None).verify(ws, plan, reqs, True)
    msgs = " | ".join(problems.get("js/app.js", []))
    assert "calls /api/auth/login, /api/tasks, which server.py does not have" in msgs
    assert "/api/items/todos" not in msgs.split("which server.py")[0]
    assert "reads form field(s) that no page has a name= for: confirm-password" in msgs
    assert "email" not in msgs.split("name= for:")[1].split("(")[0]
