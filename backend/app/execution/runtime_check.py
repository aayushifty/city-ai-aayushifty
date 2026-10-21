"""Runs a built web project in headless Microsoft Edge and reports what really happens in the browser.

A temporary copy of the project is served on 127.0.0.1 and every page gets a small probe:
- every JavaScript error, failed script/style/module load and unhandled promise rejection is recorded;
- the page's import map points 'three' at a shim that re-exports Three.js and watches WebGLRenderer.render,
  so the probe knows how many frames were drawn and which named objects, meshes and geometry types were
  actually in the rendered scene.

The probe writes its findings into the DOM, which Edge prints with --dump-dom. Nothing is sent anywhere; the
only network access is the page's own CDN loads (Three.js).
"""

from __future__ import annotations

import asyncio
import html
import json
import os
import re
import shutil
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional

THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
BUDGET_MS = 7000

PROBE = """<script>
(function () {
  var p = window.__probe = { errors: [], frames: 0, renderers: 0, scene: null };
  // headless Edge under virtual time runs requestAnimationFrame only a couple of times; timers do advance, so
  // animation frames are driven by a timer here (otherwise a working animation loop would look dead)
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
  window.cancelAnimationFrame = function (id) { clearTimeout(id); };
  function push(msg) { if (p.errors.length < 30) p.errors.push(String(msg).slice(0, 300)); }
  addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) push('failed to load <' + t.tagName.toLowerCase() + '> ' + (t.src || t.href || '(inline)'));
    else push((e.message || 'error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : ''));
  }, true);
  addEventListener('unhandledrejection', function (e) { push('unhandled promise rejection: ' + (e.reason && (e.reason.message || e.reason))); });
  var cw = console.warn;
  console.warn = function () { try { push('console.warn: ' + Array.prototype.join.call(arguments, ' ')); } catch (x) {} return cw.apply(console, arguments); };
  var ce = console.error;
  console.error = function () { try { push('console.error: ' + Array.prototype.join.call(arguments, ' ')); } catch (x) {} return ce.apply(console, arguments); };
  setTimeout(function () {
    var canvases = Array.prototype.map.call(document.querySelectorAll('canvas'), function (c) { return [c.width, c.height]; });
    document.documentElement.setAttribute('data-probe', JSON.stringify({
      errors: p.errors, frames: p.frames, renderers: p.renderers, scene: p.scene, canvases: canvases,
      text: (document.body && document.body.innerText || '').length, title: document.title
    }));
  }, %d);
})();
</script>""" % (BUDGET_MS - 1500)

SHIM = """export * from '%s';
import * as T from '%s';
// Three.js attaches render() to each renderer instance in its constructor, so it is wrapped per instance here.
// (A local export wins over the star export: every renderer the page creates goes through this class.)
function record(scene) {
  const p = window.__probe;
  if (!p) return;
  p.frames++;
  if (scene && scene.isScene && (p.frames < 4 || p.frames %% 15 === 0)) {
    const names = new Set(), geos = new Set();
    let meshes = 0;
    scene.traverse(o => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { meshes++; if (o.geometry && o.geometry.type) geos.add(o.geometry.type); }
      if (o.name) names.add(o.name);
    });
    if (!p.scene || meshes >= p.scene.meshes) p.scene = { meshes, names: [...names].slice(0, 300), geometries: [...geos] };
  }
}
export class WebGLRenderer extends T.WebGLRenderer {
  constructor(...args) {
    super(...args);
    if (window.__probe) window.__probe.renderers++;
    const render = this.render;
    this.render = (scene, camera) => { try { record(scene); } catch (e) {} return render.call(this, scene, camera); };
  }
}
""" % (THREE_CDN, THREE_CDN)


def edge_path() -> Optional[str]:
    for p in [shutil.which("msedge"), *EDGE_PATHS]:
        if p and os.path.isfile(p):
            return p
    return None


def _instrument(src: Path, dest: Path) -> List[str]:
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns(".git"))
    (dest / "__probe_three.js").write_text(SHIM, encoding="utf-8")
    pages = []
    for page in dest.rglob("*.html"):
        rel = page.relative_to(dest).as_posix()
        text = page.read_text(encoding="utf-8", errors="replace")
        shim = os.path.relpath(dest / "__probe_three.js", page.parent).replace("\\", "/")
        shim = shim if shim.startswith(".") else "./" + shim
        text = re.sub(r'("three"\s*:\s*")[^"]+(")', lambda m: m.group(1) + shim + m.group(2), text, count=1)
        head = re.search(r"<head[^>]*>", text, re.IGNORECASE)
        text = (text[:head.end()] + PROBE + text[head.end():]) if head else PROBE + text
        page.write_text(text, encoding="utf-8")
        pages.append(rel)
    return sorted(pages, key=lambda r: (r != "index.html", r))


class _Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # no console noise
        pass


async def run_pages(project: Path, timeout_s: int = 40) -> Dict[str, Any]:
    """Returns {"available": bool, "reason": str, "pages": {rel: probe-dict-or-{"error": ...}}}."""
    edge = edge_path()
    if not edge:
        return {"available": False, "reason": "Microsoft Edge was not found, so pages were not run in a browser", "pages": {}}
    tmp = Path(tempfile.mkdtemp(prefix="cityai-run-"))
    root = tmp / "site"
    pages = _instrument(project, root)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(_Quiet, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    results: Dict[str, Any] = {}
    try:
        for rel in pages[:8]:
            cmd = [edge, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
                   "--no-first-run", "--no-default-browser-check", "--disable-extensions", f"--user-data-dir={tmp / 'profile'}",
                   f"--virtual-time-budget={BUDGET_MS}", "--dump-dom", f"http://127.0.0.1:{port}/{rel}"]
            proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            try:
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
            except asyncio.TimeoutError:
                proc.kill()
                results[rel] = {"error": "the page did not finish loading in the browser (timeout)"}
                continue
            m = re.search(r'data-probe="([^"]*)"', out.decode("utf-8", "replace"))
            if not m:
                results[rel] = {"error": "the browser produced no result for this page (it may have crashed or hung)"}
                continue
            try:
                results[rel] = json.loads(html.unescape(m.group(1)))
            except Exception:
                results[rel] = {"error": "unreadable browser result"}
    finally:
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    return {"available": True, "reason": "", "pages": results}


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def name_in_scene(name: str, scene_names: List[str]) -> Optional[str]:
    """Matches a requirement's object name against the names in the rendered scene (rocket_on_pad ~ RocketOnPad)."""
    want = _norm(name)
    if not want:
        return None
    for n in scene_names:
        got = _norm(n)
        if got and (got == want or want in got or got in want):
            return n
    words = [w for w in re.split(r"[_\-\s]+", name.lower()) if len(w) > 3]
    for n in scene_names:
        if words and all(w in n.lower() for w in words[:2]):
            return n
    return None
