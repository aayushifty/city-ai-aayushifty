"""Request changes on finished work: same citizen, same workspace, previous files + feedback, verification
with repair attempts, and versioned deliverables that each keep their own link."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.testclient import TestClient

from app.config import config
from app.execution.agent_service import CitizenExecutionService
from app.execution.computer_service import computer_service
from app.execution.task_history import TaskHistory
from app.models.database import Database
from app.models.schemas import CitizenTaskRequest
from app.providers.router import model_router


class ScriptedModel:
    """Returns the scripted replies in order (the last one repeats) and records every prompt."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts = []

    async def __call__(self, request, preferred_provider=None, interactive=False, **kwargs):
        self.prompts.append(request.prompt)
        reply = self.replies[min(len(self.prompts) - 1, len(self.replies) - 1)]
        if not isinstance(reply, str):
            reply = json.dumps(reply)
        return SimpleNamespace(content=reply, model_name="scripted", provider_name="test")


def files_reply(files, summary="done"):
    return {"summary": summary, "files": [{"path": k, "content": v} for k, v in files.items()]}


GREET = "def greet(name):\n    return f'Hello, {name}'\n"
GREET_TEST = "from greet import greet\n\ndef test_greet():\n    assert greet('Ana').startswith('Hello')\n"
GREET_V2 = "def greet(name):\n    return f'Hello, {name}! Welcome to the city.'\n"
GREET_V2_BROKEN = "def greet(name):\n    return f'Hi {name}'\n"
TASK = CitizenTaskRequest(title="Greeting helper", description="greet() with a test", expected_deliverable="greet.py")


@pytest.fixture
def svc(tmp_path, monkeypatch):
    s = CitizenExecutionService(Database(tmp_path / "city.db"))
    s.workspaces_root = tmp_path / "workspaces"
    s.workspaces_root.mkdir()
    s.history = TaskHistory(tmp_path / "history.json")
    # every deliverable and version snapshot goes to a temp folder, never into the real data/deliverables
    monkeypatch.setattr(config, "DELIVERABLES_DIR", tmp_path / "deliverables")
    monkeypatch.setattr(computer_service, "websites_dir", tmp_path / "deliverables" / "websites")
    monkeypatch.setattr(computer_service, "presentations_dir", tmp_path / "deliverables" / "3d_presentations")
    return s


async def finished_task(svc, monkeypatch, task_id="task-orig1"):
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([files_reply({"greet.py": GREET, "test_greet.py": GREET_TEST})]))
    citizen = svc.get_citizen("agent-engineer")
    res = await svc._run_task_execution_loop(citizen, task_id, TASK)
    assert res["verified"] is True
    return svc.history.get(task_id)


def snapshot_file(url: str, name: str) -> Path:
    rel = url.split("/deliverables/", 1)[1]
    return config.DELIVERABLES_DIR / rel if rel.endswith(name) else config.DELIVERABLES_DIR / rel / name


@pytest.mark.asyncio
async def test_revision_edits_the_same_workspace_and_keeps_both_versions(svc, monkeypatch):
    orig = await finished_task(svc, monkeypatch)
    model = ScriptedModel([files_reply({"greet.py": GREET_V2}, "added a welcome")])
    monkeypatch.setattr(model_router, "route_completion", model)

    started = svc.revise_task("task-orig1", "Make the greeting also welcome them to the city.")
    assert started["version"] == 2 and started["revision_of"] == "task-orig1" and started["root_task_id"] == "task-orig1"
    await svc._active_tasks[started["task_id"]]

    prompt = model.prompts[0]
    assert "welcome them to the city" in prompt, "the feedback goes to the model"
    assert GREET.strip() in prompt and "test_greet.py" in prompt, "the model sees its previous files"

    v2 = svc.history.get(started["task_id"])
    assert v2["status"] == "VERIFIED" and v2["kind"] == "REVISION"
    assert v2["workspace"] == orig["workspace"], "a revision edits the same workspace"
    assert v2["feedback"].startswith("Make the greeting") and v2["version"] == 2
    assert v2["title"] == "Greeting helper (v2)"
    assert Path(orig["workspace"], "greet.py").read_text(encoding="utf-8") == GREET_V2

    v1 = svc.history.get("task-orig1")
    assert v1["version"] == 1
    v1_url = next(d["url"] for d in v1["deliverables"] if d["path"] == "greet.py")
    v2_url = next(d["url"] for d in v2["deliverables"] if d["path"] == "greet.py")
    assert v1_url != v2_url and "/revisions/task-orig1/v1/" in v1_url and "/revisions/task-orig1/v2/" in v2_url
    assert snapshot_file(v1_url, "greet.py").read_text(encoding="utf-8") == GREET, "v1 stays exactly as it was"
    assert snapshot_file(v2_url, "greet.py").read_text(encoding="utf-8") == GREET_V2

    chain = svc.revision_chain(started["task_id"])
    assert [r["version"] for r in chain] == [1, 2]


@pytest.mark.asyncio
async def test_revision_that_breaks_tests_goes_through_repair(svc, monkeypatch):
    await finished_task(svc, monkeypatch)
    model = ScriptedModel([files_reply({"greet.py": GREET_V2_BROKEN}), files_reply({"greet.py": GREET_V2})])
    monkeypatch.setattr(model_router, "route_completion", model)

    started = svc.revise_task("task-orig1", "Shorter greeting please")
    await svc._active_tasks[started["task_id"]]
    rec = svc.history.get(started["task_id"])
    assert rec["status"] == "VERIFIED"
    assert rec["verification"]["repair_attempts"] == 1
    assert "1 failed" in model.prompts[1], "the repair prompt carries the real test failure"


@pytest.mark.asyncio
async def test_revision_without_edited_files_changes_nothing_and_says_so(svc, monkeypatch):
    orig = await finished_task(svc, monkeypatch)
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel(["Sure, I will make it friendlier!"]))

    started = svc.revise_task("task-orig1", "Friendlier wording")
    await svc._active_tasks[started["task_id"]]
    rec = svc.history.get(started["task_id"])
    assert rec["status"] == "FAILED"
    assert "not applied" in rec["verification"]["output"]
    assert Path(orig["workspace"], "greet.py").read_text(encoding="utf-8") == GREET


@pytest.mark.asyncio
async def test_revision_guards(svc, monkeypatch):
    with pytest.raises(LookupError):
        svc.revise_task("task-nope", "anything")
    await finished_task(svc, monkeypatch)
    with pytest.raises(ValueError):
        svc.revise_task("task-orig1", "   ")

    gate = asyncio.Event()

    async def slow(request, preferred_provider=None, interactive=False, **kwargs):
        await gate.wait()
        return SimpleNamespace(content=json.dumps(files_reply({"greet.py": GREET_V2})), model_name="s", provider_name="t")

    monkeypatch.setattr(model_router, "route_completion", slow)
    started = svc.revise_task("task-orig1", "first change")
    with pytest.raises(RuntimeError):
        svc.revise_task("task-orig1", "second change while the first is running")
    with pytest.raises(RuntimeError):
        svc.revise_task(started["task_id"], "revising a version that is still running")
    gate.set()
    await svc._active_tasks[started["task_id"]]

    # once v2 is done, v3 can build on it
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([files_reply({"greet.py": GREET})]))
    v3 = svc.revise_task(started["task_id"], "go back to the short greeting")
    assert v3["version"] == 3 and v3["root_task_id"] == "task-orig1"
    await svc._active_tasks[v3["task_id"]]
    assert [r["version"] for r in svc.revision_chain("task-orig1")] == [1, 2, 3]


async def old_template_site(svc, monkeypatch, content):
    """A website made before projects existed (the one-page template): it must stay revisable."""
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([content]))
    citizen = svc.get_citizen("agent-webdev")
    tid = "task-oldsite"
    svc.history.start(tid, citizen.id, citizen.name, "Website: a bakery", kind="CHAT", status="WORKING")
    res = await svc._produce_web_deliverable(citizen, tid, "WEBSITE", "a bakery", context="Make a website for a bakery")
    svc._record_artifact(citizen, tid, res["artifact"], res["evidence"].exit_code == 0)
    svc._finish_history(tid, True, res["evidence"], 0)
    svc.history.update(tid, status="VERIFIED")
    return tid, res["artifact"].url


SITE_V1 = {"brand": "Sunrise Bakery", "headline": "Fresh bread every morning", "subheadline": "Since 1998.",
           "features_title": "Why us", "about": "A family bakery in Patan.",
           "features": [{"icon": "🥖", "title": "Sourdough", "text": "Baked daily."},
                        {"icon": "☕", "title": "Coffee", "text": "Local beans."}],
           "metrics": [{"value": "25", "label": "Years"}]}
SITE_V2 = {**SITE_V1, "headline": "Warm bread before sunrise", "features": SITE_V1["features"] + [
    {"icon": "🎂", "title": "Cakes", "text": "Custom birthday cakes."}]}


@pytest.mark.asyncio
async def test_website_revision_edits_the_previous_content_and_gets_a_new_link(svc, monkeypatch):
    orig_id, v1_url = await old_template_site(svc, monkeypatch, SITE_V1)

    model = ScriptedModel([SITE_V2])
    monkeypatch.setattr(model_router, "route_completion", model)
    started = svc.revise_task(orig_id, "Change the headline and add a cakes feature")
    await svc._active_tasks[started["task_id"]]

    prompt = model.prompts[0]
    assert "Fresh bread every morning" in prompt, "the model edits the previous content"
    assert "add a cakes feature" in prompt
    rec = svc.history.get(started["task_id"])
    assert rec["status"] == "VERIFIED" and rec["version"] == 2
    v2_url = rec["deliverables"][0]["url"]
    assert v2_url != v1_url
    v2_html = snapshot_file(v2_url, "index.html").read_text(encoding="utf-8")
    assert "Warm bread before sunrise" in v2_html and "Cakes" in v2_html
    assert "Fresh bread every morning" in snapshot_file(v1_url, "index.html").read_text(encoding="utf-8"), "v1 is untouched"


@pytest.mark.asyncio
async def test_website_revision_is_not_faked_when_the_model_fails(svc, monkeypatch):
    orig_id, _ = await old_template_site(svc, monkeypatch, SITE_V1)
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel(["I changed it for you!"]))
    started = svc.revise_task(orig_id, "New headline")
    await svc._active_tasks[started["task_id"]]
    rec = svc.history.get(started["task_id"])
    assert rec["status"] == "FAILED" and "not applied" in rec["verification"]["output"]


@pytest.mark.asyncio
async def test_chat_revise_that_starts_the_next_version(svc, monkeypatch):
    await finished_task(svc, monkeypatch)
    res = await svc.chat_with_citizen("agent-engineer", "edit it")
    assert res.action_taken == "REVISION_NEEDS_FEEDBACK"

    model = ScriptedModel([files_reply({"greet.py": GREET_V2})])
    monkeypatch.setattr(model_router, "route_completion", model)
    res = await svc.chat_with_citizen("agent-engineer", "Revise that: add a welcome to the city")
    assert res.action_taken == "REVISION_STARTED" and "version 2" in res.reply
    rev = next(r for r in svc.history.list() if r["kind"] == "REVISION")
    assert rev["revision_of"] == "task-orig1" and rev["feedback"] == "add a welcome to the city"
    await svc._active_tasks[rev["task_id"]]

    res = await svc.chat_with_citizen("agent-qa", "revise that: anything")
    assert res.action_taken == "REVISION_NOTHING_TO_REVISE"


def test_revise_route_maps_errors(monkeypatch):
    from app.api import routes_agents
    from app.main import app
    client = TestClient(app, base_url="http://127.0.0.1")

    def boom(exc):
        def f(task_id, feedback):
            raise exc
        return f

    for exc, code in ((LookupError("x"), 404), (ValueError("x"), 400), (RuntimeError("x"), 409)):
        monkeypatch.setattr(routes_agents.agent_service, "revise_task", boom(exc))
        assert client.post("/api/tasks/task-1/revise", json={"feedback": "f"}).status_code == code

    monkeypatch.setattr(routes_agents.agent_service, "revise_task",
                        lambda task_id, feedback: {"task_id": "task-2", "version": 2, "revision_of": task_id})
    res = client.post("/api/tasks/task-1/revise", json={"feedback": "shorter"})
    assert res.status_code == 200 and res.json()["version"] == 2


def test_revise_route_runs_on_the_event_loop():
    """The revision is started with create_task, so the route must be async (a sync route runs in a worker
    thread without an event loop)."""
    import inspect
    from app.api import routes_agents
    assert inspect.iscoroutinefunction(routes_agents.revise_task)


def test_revise_task_outside_the_event_loop_writes_no_record(svc):
    asyncio.run(_finish_quick(svc))
    before = len(svc.history.list())
    with pytest.raises(RuntimeError):
        svc.revise_task("task-q1", "some change")       # no running loop here
    assert len(svc.history.list()) == before, "no orphan QUEUED record"


async def _finish_quick(svc):
    svc.history.start("task-q1", "agent-engineer", "Drishya Adhikari", "Quick", kind="TASK")
    ws = svc.workspaces_root / "ws-q1"
    ws.mkdir()
    (ws / "a.md").write_text("hello", encoding="utf-8")
    svc.history.update("task-q1", status="VERIFIED", workspace=str(ws))
    svc.history.add_deliverable("task-q1", "a.md")


@pytest.mark.asyncio
async def test_revision_accepts_files_in_the_layout_the_model_was_shown(svc, monkeypatch):
    await finished_task(svc, monkeypatch)
    reply = "Here are the changes.\n\n--- greet.py ---\n```python\n" + GREET_V2 + "```\n"
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([reply]))
    started = svc.revise_task("task-orig1", "Welcome them to the city")
    await svc._active_tasks[started["task_id"]]
    rec = svc.history.get(started["task_id"])
    assert rec["status"] == "VERIFIED"
    assert Path(rec["workspace"], "greet.py").read_text(encoding="utf-8") == GREET_V2


def test_files_from_text_formats():
    from app.execution.agent_service import _files_from_text
    assert _files_from_text("--- a.py ---\nx=1\n\n--- test_a.py ---\n```python\nfrom a import x\n```\n", []) == [
        {"path": "a.py", "content": "x=1\n"}, {"path": "test_a.py", "content": "from a import x\n"}]
    assert _files_from_text("**greet.py**\n```python\ndef g(): pass\n```", []) == [{"path": "greet.py", "content": "def g(): pass\n"}]
    assert _files_from_text("```python\nprint(1)\n```", ["only.py"]) == [{"path": "only.py", "content": "print(1)\n"}]
    assert _files_from_text("```python\nprint(1)\n```", ["a.py", "b.py"]) == [], "ambiguous: never guess between files"
    assert _files_from_text("I will do it soon!", ["a.py"]) == []
