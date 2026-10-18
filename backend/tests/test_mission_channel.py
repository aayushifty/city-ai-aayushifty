"""Mission channel (one shared thread per mission), one coherent deliverable for website / presentation
missions, Governor messages to the whole team, @mentions, the final report and 'revise:' from the channel."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.testclient import TestClient

from app.config import config
from app.execution import verifier
from app.execution.agent_service import CitizenExecutionService
from app.execution.computer_service import _clean_text, computer_service
from app.execution.task_history import TaskHistory
from app.models.database import Database
from app.models.schemas import PublicMissionCreateRequest
from app.providers.router import model_router


class Router:
    """Stands in for the model router: planning gets the plan, website steps get site JSON, chat gets a reply."""

    def __init__(self, plan, site=None, reply="Understood, the team will follow that."):
        self.plan, self.site, self.reply = plan, site, reply
        self.calls = []

    async def __call__(self, request, preferred_provider=None, interactive=False):
        self.calls.append((request.prompt, interactive))
        p = request.prompt
        if "Decompose this mission" in p:
            out = self.plan
        elif "one-page website" in p or "5-7 slide" in p:
            out = self.site
        else:
            out = self.reply
        return SimpleNamespace(content=out if isinstance(out, str) else json.dumps(out), model_name="m", provider_name="t")


SITE = {"brand": "Lumen Port", "headline": "Gateway to orbit", "subheadline": "Launches and tours.", "cta": "Visit",
        "features_title": "What we do", "about": "A civic space port.", "scene": "orbit", "accent": "#f59e0b",
        "features": [{"icon": "🚀", "title": "Launch", "text": "Daily launches."}, {"icon": "🛰", "title": "Dock", "text": "Safe docking."}],
        "sections": [{"title": "Safety", "text": "Every launch is checked twice."}],
        "metrics": [{"value": "24/7", "label": "Operations"}]}
PLAN = {"summary": "s", "subtasks": [
    {"id": "1", "title": "Research the space port", "assigned_agent_id": "agent-researcher", "expected_deliverable": "research.md", "dependencies": []},
    {"id": "2", "title": "Write the website copy", "assigned_agent_id": "agent-analyst", "expected_deliverable": "site.html", "dependencies": []},
]}


@pytest.fixture
def svc(tmp_path, monkeypatch):
    s = CitizenExecutionService(Database(tmp_path / "city.db"))
    s.workspaces_root = tmp_path / "workspaces"
    s.workspaces_root.mkdir()
    s.history = TaskHistory(tmp_path / "history.json")
    monkeypatch.setattr(config, "DELIVERABLES_DIR", tmp_path / "deliverables")
    monkeypatch.setattr(computer_service, "websites_dir", tmp_path / "deliverables" / "websites")
    monkeypatch.setattr(computer_service, "presentations_dir", tmp_path / "deliverables" / "3d_presentations")
    return s


def fake_supporting_loop(svc, log, fail=()):
    """Supporting steps write a markdown file (no model); the final step runs the real website flow."""
    real = svc._run_task_execution_loop

    async def loop(citizen, task_id, req, workspace_dir=None, context="", mission_id=None, revision=None, allow_web=True):
        log.append({"title": req.title, "allow_web": allow_web, "context": context, "desc": req.description})
        if req.title.startswith("Assemble the final"):
            return await real(citizen, task_id, req, workspace_dir=workspace_dir, context=context,
                              mission_id=mission_id, revision=revision, allow_web=allow_web)
        await asyncio.sleep(0.01)
        name = "research.md" if "Research" in req.title else "copy.md"
        Path(workspace_dir, name).write_text(f"notes for {req.title}", encoding="utf-8")
        ok = req.title not in fail
        svc.history.update(task_id, status="VERIFIED" if ok else "FAILED")
        return {"verified": ok, "files": [name], "summary": "ok", "error": None if ok else "tests failed"}
    return loop


async def run(svc, monkeypatch, title="Build a 3D website for the space port", fail=()):
    log = []
    router = Router(PLAN, SITE)
    monkeypatch.setattr(model_router, "route_completion", router)
    monkeypatch.setattr(svc, "_run_task_execution_loop", fake_supporting_loop(svc, log, fail))
    mission = svc.submit_public_mission(PublicMissionCreateRequest(title=title, description="For visitors and crews."))
    await svc._active_tasks[mission["id"]]
    return mission, log, router


def kinds(mission):
    return [p["kind"] for p in mission["channel"]]


@pytest.mark.asyncio
async def test_website_mission_builds_one_coherent_3d_site_from_everyones_work(svc, monkeypatch):
    mission, log, _ = await run(svc, monkeypatch)
    titles = [s["title"] for s in mission["subtasks"]]
    assert titles[-1] == "Assemble the final 3D website: Build a 3D website for the space port"
    final = mission["subtasks"][-1]
    assert final["assigned_agent_id"] == "agent-webdev" and set(final["dependencies"]) == {s["id"] for s in mission["subtasks"][:-1]}

    # supporting steps may not build their own sites; their .html deliverable became content
    supporting = [e for e in log if not e["title"].startswith("Assemble")]
    assert supporting and all(e["allow_web"] is False for e in supporting)
    assert mission["subtasks"][1]["expected_deliverable"] == "site_content.md"
    # the assembly step ran last, with everyone's work in its context
    assert log[-1]["title"].startswith("Assemble") and log[-1]["allow_web"] is True
    assert "notes for Research the space port" in log[-1]["context"] and "notes for Write the website copy" in log[-1]["context"]

    assert mission["status"] == "COMPLETED"
    fd = mission["final_deliverable"]
    assert fd and "/websites/" in fd["url"]
    html = (config.DELIVERABLES_DIR / fd["url"].split("/deliverables/")[1] / "index.html").read_text(encoding="utf-8")
    assert "three.min.js" in html and verifier.check_html(html) == []
    assert 'class="metrics"' not in html, "a single metric does not get an empty-looking strip"

    k = kinds(mission)
    assert k[0] == "brief" and "plan" in k and "final" in k and k[-1] == "report"
    assert k.count("progress") == 3 and k.count("deliverable") == 3
    assert fd["url"] in mission["channel"][-1]["text"]


@pytest.mark.asyncio
async def test_final_step_still_runs_when_one_contributor_fails(svc, monkeypatch):
    mission, log, _ = await run(svc, monkeypatch, fail=("Write the website copy",))
    assert mission["subtasks"][1]["status"] == "FAILED"
    assert mission["subtasks"][-1]["status"] == "COMPLETED"
    assert "did not succeed" in log[-1]["desc"] and "Write the website copy" in log[-1]["desc"]
    assert mission["status"] == "PARTIAL"
    report = mission["channel"][-1]["text"]
    assert "PARTIAL" in report and "Write the website copy" in report


@pytest.mark.asyncio
async def test_non_web_mission_gets_no_assembly_step(svc, monkeypatch):
    mission, log, _ = await run(svc, monkeypatch, title="Audit the city payroll")
    assert not any(s.get("final") for s in mission["subtasks"])
    assert all(e["allow_web"] is True for e in log)
    assert mission["final_deliverable"] is None


SEQ_PLAN = {"summary": "s", "subtasks": [
    {"id": "1", "title": "Research the space port", "assigned_agent_id": "agent-researcher", "expected_deliverable": "research.md", "dependencies": []},
    {"id": "2", "title": "Write the website copy", "assigned_agent_id": "agent-analyst", "expected_deliverable": "copy.md", "dependencies": ["1"]},
]}


@pytest.mark.asyncio
async def test_governor_message_reaches_everyone_and_later_steps_follow_it(svc, monkeypatch):
    gate = asyncio.Event()
    log = []
    router = Router(SEQ_PLAN, SITE, reply="Noted: we'll keep the palette dark blue.")
    monkeypatch.setattr(model_router, "route_completion", router)
    inner = fake_supporting_loop(svc, log)

    async def loop(citizen, task_id, req, **kw):
        if req.title == "Research the space port":
            await gate.wait()                  # step 1 is running when the Governor writes
        return await inner(citizen, task_id, req, **kw)

    monkeypatch.setattr(svc, "_run_task_execution_loop", loop)
    mission = svc.submit_public_mission(PublicMissionCreateRequest(title="Build a website for the port", description="d"))
    while not any(s["status"] == "WORKING" for s in mission["subtasks"]):
        await asyncio.sleep(0.01)

    svc.post_to_mission(mission["id"], "Use a dark blue palette everywhere.")
    gate.set()
    await svc._active_tasks[mission["id"]]
    for _ in range(100):
        if any(p["kind"] == "reply" for p in mission["channel"]):
            break
        await asyncio.sleep(0.02)

    gov = [p for p in mission["channel"] if p["author_kind"] == "governor"]
    assert gov[-1]["text"] == "Use a dark blue palette everywhere."
    ack = next(p for p in mission["channel"] if p["text"].startswith("📣 Delivered to"))
    assert "2 step(s) that have not started will follow it" in ack["text"]
    assert "1 already running will not see it" in ack["text"], "the channel is honest about the running step"
    reply = next(p for p in mission["channel"] if p["kind"] == "reply")
    assert reply["author_id"] == "agent-coordinator" and "dark blue" in reply["text"]
    assert any(i for _, i in router.calls if i), "the reply uses the interactive (priority) lane"
    by_title = {e["title"]: e for e in log}
    assert "dark blue" not in by_title["Research the space port"]["context"]
    assert "Use a dark blue palette everywhere." in by_title["Write the website copy"]["context"]
    assert "Use a dark blue palette everywhere." in log[-1]["context"], "the final assembly follows it too"


@pytest.mark.asyncio
async def test_at_mention_asks_one_citizen(svc, monkeypatch):
    mission, _, router = await run(svc, monkeypatch, title="Audit the city payroll")
    analyst = svc.get_citizen("agent-analyst")
    router.reply = "I checked the copy step; it is complete."
    svc.post_to_mission(mission["id"], f"@{analyst.name.split()[0]} is the copy final?")
    for _ in range(50):
        if mission["channel"][-1]["kind"] == "reply":
            break
        await asyncio.sleep(0.02)
    last = mission["channel"][-1]
    assert last["kind"] == "reply" and last["author_id"] == "agent-analyst"
    assert not any(p["text"].startswith("📣") for p in mission["channel"][-3:]), "a direct question is not broadcast"


@pytest.mark.asyncio
async def test_revise_from_the_channel_makes_a_new_verified_version(svc, monkeypatch):
    mission, _, router = await run(svc, monkeypatch)
    v1 = mission["final_deliverable"]
    router.site = {**SITE, "headline": "Your seat to the stars"}
    svc.post_to_mission(mission["id"], "revise: make the headline about seats to the stars")
    rev = next(r for r in svc.history.list() if r["kind"] == "REVISION")
    await svc._active_tasks[rev["task_id"]]
    for _ in range(50):
        if mission["final_deliverable"]["version"] == 2:
            break
        await asyncio.sleep(0.02)
    v2 = mission["final_deliverable"]
    assert v2["version"] == 2 and v2["url"] != v1["url"]
    assert "Version 2 is ready and verified" in mission["channel"][-1]["text"]
    html = (config.DELIVERABLES_DIR / v2["url"].split("/deliverables/")[1] / "index.html").read_text(encoding="utf-8")
    assert "Your seat to the stars" in html and "three.min.js" in html, "the revision keeps the 3D scene"


def test_channel_routes(monkeypatch):
    from app.api import routes_agents
    from app.main import app
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/missions/nope/channel").status_code == 404
    assert client.post("/api/missions/nope/channel", json={"text": "hi"}).status_code == 404
    monkeypatch.setattr(routes_agents.agent_service, "get_mission",
                        lambda mid: {"id": mid, "channel": [{"id": "p1", "text": "hello"}]})
    assert client.get("/api/missions/m1/channel").json()["posts"][0]["text"] == "hello"
    import inspect
    assert inspect.iscoroutinefunction(routes_agents.post_to_mission_channel)


def test_text_is_shortened_at_a_word_boundary():
    out = _clean_text("supporting autonomous systems through careful design", 32)
    assert out.endswith("…") and "systems t…" not in out and out.startswith("supporting autonomous")
