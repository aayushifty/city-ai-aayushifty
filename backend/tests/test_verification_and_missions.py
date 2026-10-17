"""Real verification with repair, AI-written web deliverables, mission dependency graphs and task history."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.testclient import TestClient

from app.execution import verifier
from app.execution.agent_service import CitizenExecutionService
from app.execution.task_history import TaskHistory
from app.models.database import Database
from app.models.schemas import CitizenTaskRequest, PublicMissionCreateRequest
from app.providers.router import model_router


@pytest.fixture
def svc(tmp_path):
    s = CitizenExecutionService(Database(tmp_path / "city.db"))
    s.workspaces_root = tmp_path / "workspaces"
    s.workspaces_root.mkdir()
    s.history = TaskHistory(tmp_path / "history.json")
    return s


class ScriptedModel:
    """Stands in for the model router: returns the scripted replies in order (the last one repeats)."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts = []

    async def __call__(self, request, preferred_provider=None):
        self.prompts.append(request.prompt)
        reply = self.replies[min(len(self.prompts) - 1, len(self.replies) - 1)]
        if not isinstance(reply, str):
            reply = json.dumps(reply)
        return SimpleNamespace(content=reply, model_name="scripted", provider_name="test")


def files_reply(files):
    return {"summary": "done", "files": [{"path": k, "content": v} for k, v in files.items()]}


BUGGY = "def add(a, b):\n    return a - b\n"
FIXED = "def add(a, b):\n    return a + b\n"
TESTS = "from calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n"


# --- Verification checks -------------------------------------------------------------------------

def test_html_and_json_checks():
    assert verifier.check_html("<!DOCTYPE html><html><body><div><p>ok</div><script>if (a < b) {}</script></body></html>") == []
    assert verifier.check_html("<html><body><div><span>broken</div></body></html>")
    assert verifier.check_html("") == ["file is empty"]
    assert verifier.check_json('{"a": 1}') == []
    assert "invalid JSON" in verifier.check_json('{"a": }')[0]


@pytest.mark.asyncio
async def test_verify_deliverables_reports_real_failures(tmp_path):
    (tmp_path / "bad.py").write_text("def broken(:\n", encoding="utf-8")
    (tmp_path / "data.json").write_text("{not json", encoding="utf-8")
    (tmp_path / "notes.md").write_text("", encoding="utf-8")
    ev = await verifier.verify_deliverables(tmp_path, [tmp_path / "bad.py", tmp_path / "data.json", tmp_path / "notes.md"])
    assert ev.exit_code != 0
    assert ev.failed_tests == 3
    assert "SyntaxError" in ev.output_snippet and "invalid JSON" in ev.output_snippet


@pytest.mark.asyncio
async def test_verify_deliverables_runs_pytest_when_tests_exist(tmp_path):
    (tmp_path / "calc.py").write_text(BUGGY, encoding="utf-8")
    (tmp_path / "test_calc.py").write_text(TESTS, encoding="utf-8")
    ev = await verifier.verify_deliverables(tmp_path, [tmp_path / "calc.py", tmp_path / "test_calc.py"])
    assert ev.exit_code != 0 and "pytest" in ev.test_suite
    assert "1 failed" in ev.output_snippet

    (tmp_path / "calc.py").write_text(FIXED, encoding="utf-8")
    ev = await verifier.verify_deliverables(tmp_path, [tmp_path / "calc.py", tmp_path / "test_calc.py"])
    assert ev.exit_code == 0, ev.output_snippet


# --- Task loop: verification + repair ------------------------------------------------------------

CALC_TASK = CitizenTaskRequest(title="Calculator", description="add() with tests", expected_deliverable="calc.py")


@pytest.mark.asyncio
async def test_failing_task_is_repaired_by_the_model(svc, monkeypatch):
    model = ScriptedModel([files_reply({"calc.py": BUGGY, "test_calc.py": TESTS}), files_reply({"calc.py": FIXED})])
    monkeypatch.setattr(model_router, "route_completion", model)
    citizen = svc.get_citizen("agent-engineer")

    result = await svc._run_task_execution_loop(citizen, "task-repair1", CALC_TASK)

    assert result["verified"] is True
    assert result["attempts"] == 1
    assert len(model.prompts) == 2
    assert "1 failed" in model.prompts[1], "the repair prompt must carry the real pytest output"
    rec = svc.history.get("task-repair1")
    assert rec["status"] == "VERIFIED" and rec["verification"]["repair_attempts"] == 1
    art = svc.get_artifact("task-repair1")
    assert art.verification_exit_code == 0
    assert Path(art.file_path).read_text(encoding="utf-8") == FIXED


@pytest.mark.asyncio
async def test_task_that_cannot_be_repaired_reports_failure(svc, monkeypatch):
    model = ScriptedModel([files_reply({"calc.py": BUGGY, "test_calc.py": TESTS})])  # repairs never fix it
    monkeypatch.setattr(model_router, "route_completion", model)
    citizen = svc.get_citizen("agent-engineer")

    result = await svc._run_task_execution_loop(citizen, "task-repair2", CALC_TASK)

    assert result["verified"] is False
    assert result["attempts"] == 3
    assert len(model.prompts) == 4  # initial attempt + 3 repairs
    rec = svc.history.get("task-repair2")
    assert rec["status"] == "FAILED" and rec["verification"]["verified"] is False
    art = svc.get_artifact("task-repair2")
    assert art.verification_exit_code != 0
    assert "FAILED" in art.verification_summary
    ws = Path(rec["workspace"])
    assert "assert True" not in (ws / "calc.py").read_text(encoding="utf-8")
    assert citizen.status == "FAILED"


# --- AI-written websites / presentations ---------------------------------------------------------

@pytest.mark.asyncio
async def test_presentation_uses_model_written_slides(svc, monkeypatch):
    slides = {"slides": [
        {"title": "Photosynthesis Basics", "desc": "Light becomes chemical energy.", "bullets": ["Chlorophyll"]},
        {"title": "The Calvin Cycle", "desc": "Carbon fixation.", "bullets": ["RuBisCO"]},
    ]}
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([slides]))
    res = await svc.chat_with_citizen("agent-designer", "Make a 3D presentation on photosynthesis")
    assert res.action_taken == "CREATED_3D_PRESENTATION"
    assert "/deliverables/3d_presentations/" in res.deliverable_url
    assert res.deliverable_url in res.reply
    html = Path(res.deliverable_path).read_text(encoding="utf-8")
    assert "The Calvin Cycle" in html and "RuBisCO" in html
    assert "template" not in res.reply.lower()
    rec = svc.history.list()[0]
    assert rec["status"] == "VERIFIED" and rec["deliverables"][0]["url"] == res.deliverable_url


@pytest.mark.asyncio
async def test_website_falls_back_to_template_and_says_so(svc, monkeypatch):
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel(["Sure! Here is a great website."]))
    res = await svc.chat_with_citizen("agent-webdev", "Make a website for a bakery")
    assert res.action_taken == "CREATED_WEBSITE"
    assert "template" in res.reply.lower()
    assert "/deliverables/websites/" in res.deliverable_url
    assert svc.get_artifact(res.artifact_id).url == res.deliverable_url


# --- Missions ------------------------------------------------------------------------------------

def plan(*subtasks):
    return {"summary": "plan", "subtasks": [
        {"id": i, "title": f"Step {i}", "assigned_agent_id": agent, "expected_deliverable": f"{i}.md", "dependencies": deps}
        for i, agent, deps in subtasks
    ]}


GRAPH = plan(
    ("A", "agent-analyst", []),
    ("B", "agent-architect", []),
    ("C", "agent-engineer", ["A", "B"]),
    ("D", "agent-qa", ["C"]),
    ("E", "agent-devops", ["A"]),
)


async def run_mission(svc, monkeypatch, outcomes):
    """Runs GRAPH with a fake task loop; outcomes maps step letter -> verified."""
    monkeypatch.setattr(model_router, "route_completion", ScriptedModel([GRAPH]))
    log = {"events": [], "contexts": {}, "workspaces": set()}

    async def fake_loop(citizen, task_id, req, workspace_dir=None, context="", mission_id=None):
        step = req.title.split()[-1]
        log["events"].append(("start", step))
        log["contexts"][step] = context
        log["workspaces"].add(str(workspace_dir))
        await asyncio.sleep(0.05)
        Path(workspace_dir, f"{step}.md").write_text(f"output of step {step}", encoding="utf-8")
        log["events"].append(("end", step))
        ok = outcomes.get(step, True)
        svc.history.update(task_id, status="VERIFIED" if ok else "FAILED")
        return {"verified": ok, "files": [f"{step}.md"], "summary": f"did {step}", "error": None if ok else "tests failed"}

    monkeypatch.setattr(svc, "_run_task_execution_loop", fake_loop)
    mission = await svc.publish_public_mission(PublicMissionCreateRequest(title="M", description="d"))
    await svc._active_tasks[mission["id"]]
    return mission, log, {st["title"].split()[-1]: st for st in mission["subtasks"]}


@pytest.mark.asyncio
async def test_mission_runs_in_parallel_and_respects_dependencies(svc, monkeypatch):
    mission, log, st = await run_mission(svc, monkeypatch, {})
    ev = log["events"]
    assert ev.index(("start", "B")) < ev.index(("end", "A")), "independent subtasks must run in parallel"
    assert ev.index(("start", "C")) > max(ev.index(("end", "A")), ev.index(("end", "B")))
    assert ev.index(("start", "D")) > ev.index(("end", "C"))
    assert len(log["workspaces"]) == 1 and mission["id"] in next(iter(log["workspaces"]))
    assert "output of step A" in log["contexts"]["C"] and "output of step B" in log["contexts"]["C"]
    assert log["contexts"]["A"] == ""
    assert mission["status"] == "COMPLETED" and mission["progress"] == 100
    assert all(s["status"] == "COMPLETED" for s in st.values())


@pytest.mark.asyncio
async def test_mission_failure_blocks_dependents_and_is_partial(svc, monkeypatch):
    mission, log, st = await run_mission(svc, monkeypatch, {"B": False})
    assert st["B"]["status"] == "FAILED"
    assert st["C"]["status"] == "BLOCKED" and st["D"]["status"] == "BLOCKED"
    assert st["C"]["blocked_by"] == [st["B"]["id"]]
    assert st["A"]["status"] == "COMPLETED" and st["E"]["status"] == "COMPLETED"
    assert ("start", "C") not in log["events"] and ("start", "D") not in log["events"]
    assert mission["status"] == "PARTIAL"
    assert svc.history.get(st["D"]["task_id"])["status"] == "BLOCKED"


@pytest.mark.asyncio
async def test_mission_with_no_successes_is_failed(svc, monkeypatch):
    mission, _, st = await run_mission(svc, monkeypatch, {"A": False, "B": False})
    assert {s["status"] for s in st.values()} == {"FAILED", "BLOCKED"}
    assert mission["status"] == "FAILED"


# --- Task history API ----------------------------------------------------------------------------

def test_task_history_endpoint(tmp_path, monkeypatch):
    from app.main import app
    from app.api import routes_agents

    hist = TaskHistory(tmp_path / "h.json")
    hist.start("task-x", "agent-qa", "Johan Karki", "Write tests")
    hist.update("task-x", status="WORKING", progress=40.0)
    monkeypatch.setattr(routes_agents.agent_service, "history", hist)
    res = TestClient(app, base_url="http://127.0.0.1").get("/api/task-history?agent_id=agent-qa")
    assert res.status_code == 200
    tasks = res.json()["tasks"]
    assert tasks[0]["task_id"] == "task-x" and tasks[0]["progress"] == 40.0 and tasks[0]["status"] == "WORKING"


def test_task_history_persists_and_marks_interrupted_tasks(tmp_path):
    h = TaskHistory(tmp_path / "h.json")
    h.start("t1", "a", "A", "running task")
    h.start("t2", "a", "A", "done task")
    h.update("t2", status="VERIFIED", progress=100.0)
    reloaded = TaskHistory(tmp_path / "h.json")
    assert reloaded.get("t2")["status"] == "VERIFIED"
    assert reloaded.get("t1")["status"] == "FAILED"


# --- 2-way chat -----------------------------------------------------------------------------------

def test_only_bare_greetings_skip_the_model():
    from app.execution.computer_service import computer_service
    assert computer_service.detect_intent("whats up")["intent"] == "GREETING"
    assert computer_service.detect_intent("hey safal, what are you working on today?")["intent"] == "GENERAL_QUERY"
    assert computer_service.detect_intent("what are you doing")["intent"] == "GENERAL_QUERY"


@pytest.mark.asyncio
async def test_chat_remembers_the_conversation_and_current_task(svc, monkeypatch):
    model = ScriptedModel(["I am reviewing the firewall rules.", "Yes, the firewall review I mentioned."])
    seen = []

    async def spy(request, preferred_provider=None):
        seen.append(request.system_prompt)
        return await model(request, preferred_provider)

    monkeypatch.setattr(model_router, "route_completion", spy)
    citizen = svc.get_citizen("agent-security")
    citizen.current_task = "Audit firewall rules"
    first = await svc.chat_with_citizen("agent-security", "hey, what are you working on?")
    second = await svc.chat_with_citizen("agent-security", "is that the same thing as before?")
    assert first.reply == "I am reviewing the firewall rules."
    assert "Audit firewall rules" in seen[0]
    assert "I am reviewing the firewall rules." in seen[1] and "what are you working on" in seen[1]
    assert second.reply.startswith("Yes")
