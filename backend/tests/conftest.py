"""Unit tests never start a browser or reach the internet: the project builder's browser run and CDN checks are
stubbed (tests that need specific browser results set them with the `browser` fixture)."""

import pytest

from app.execution import project_builder, runtime_check


class BrowserStub:
    """What the headless browser 'saw'. Default: every page rendered the scene with the given object names."""

    def __init__(self):
        self.available = True
        self.names = ["rocket", "launch_tower", "planet", "Scene"]
        self.geometries = ["CylinderGeometry", "ConeGeometry", "BoxGeometry", "TorusGeometry", "SphereGeometry", "RingGeometry"]
        self.per_page = {}       # page -> probe dict override
        self.calls = 0

    async def run_pages(self, project, timeout_s=40):
        self.calls += 1
        if not self.available:
            return {"available": False, "reason": "Microsoft Edge was not found", "pages": {}}
        pages = sorted(p.relative_to(project).as_posix() for p in project.rglob("*.html"))
        out = {}
        for page in pages:
            out[page] = self.per_page.get(page) or {
                "errors": [], "frames": 120, "canvases": [[800, 600]], "text": 500, "title": page,
                "scene": {"meshes": 14, "names": list(self.names), "geometries": list(self.geometries)}}
        return {"available": True, "reason": "", "pages": out}


@pytest.fixture(autouse=True)
def browser(monkeypatch):
    stub = BrowserStub()
    monkeypatch.setattr(runtime_check, "run_pages", stub.run_pages)

    async def cdn_exists(url):
        return "examples/jsm/objects/Environment.js" not in url     # one known-missing addon for tests
    monkeypatch.setattr(project_builder, "_cdn_exists", cdn_exists)
    return stub
