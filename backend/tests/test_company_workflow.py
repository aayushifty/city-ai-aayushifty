"""Company workflow: tickets carry a role, move across a kanban, and only reach done once QA signs off."""

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app.execution.agent_service import qa_static_issues, ticket_column, ticket_role
from tests.test_mission_channel import run, svc  # noqa: F401  (fixture)


def test_roles_and_columns():
    assert ticket_role("agent-coordinator") == "CEO/PM"
    assert ticket_role("agent-webdev") == "Frontend"
    assert ticket_role("agent-qa") == "QA"
    assert ticket_role("agent-unknown") == "Specialist"
    assert ticket_column("PENDING") == "backlog"
    assert ticket_column("WORKING") == "in_progress"
    assert ticket_column("REVIEW") == "review"
    assert ticket_column("COMPLETED") == "done"
    assert ticket_column("FAILED") == "blocked"


def test_qa_static_issues(tmp_path):
    assert qa_static_issues(tmp_path, []) == ["No deliverable files were produced."]
    (tmp_path / "ok.html").write_text("<html><body><h1>Hi</h1></body></html>", encoding="utf-8")
    (tmp_path / "empty.md").write_text("   ", encoding="utf-8")
    (tmp_path / "lorem.md").write_text("Lorem ipsum dolor", encoding="utf-8")
    (tmp_path / "bare.html").write_text("just text", encoding="utf-8")
    assert qa_static_issues(tmp_path, ["ok.html"]) == []
    issues = qa_static_issues(tmp_path, ["gone.md", "empty.md", "lorem.md", "bare.html"])
    assert issues == ["gone.md is missing", "empty.md is empty", "lorem.md still contains placeholder text",
                      "bare.html has no HTML document body"]


def _ticket(svc, tmp_path):
    mission = {"id": "m1", "title": "Site", "workspace_dir": str(tmp_path), "channel": []}
    st = {"id": "1", "task_id": "t1", "title": "Build the page", "status": "WORKING", "assigned_agent_id": "agent-webdev",
          "assigned_agent_name": "Web", "expected_deliverable": "index.html", "dependencies": []}
    return mission, st


@pytest.mark.asyncio
async def test_rejection_sends_ticket_back_with_notes_then_qa_signs_off(svc, tmp_path, monkeypatch):
    mission, st = _ticket(svc, tmp_path)
    attempts, verdicts = [], [(False, "Hero section missing"), (True, "Looks complete")]

    async def subtask(m, s, subtasks, qa_notes=""):
        attempts.append(qa_notes)
        return {"verified": True, "files": ["index.html"], "summary": "built"}

    async def review(m, s, result):
        assert s["status"] == "REVIEW"
        ok, notes = verdicts.pop(0)
        return ok, notes, svc.citizens["agent-qa"]

    monkeypatch.setattr(svc, "_run_mission_subtask", subtask)
    monkeypatch.setattr(svc, "_qa_review", review)
    result = await svc._run_ticket(mission, st, {})
    assert result["verified"] is True
    assert attempts == ["", "Hero section missing"]
    assert st["qa"]["approved"] is True and st["qa"]["round"] == 2
    assert st["qa_history"] == ["Hero section missing"]
    reviews = [p for p in mission["channel"] if p["kind"] == "review"]
    assert len(reviews) == 2 and "rejected" in reviews[0]["text"] and "sign-off" in reviews[1]["text"]


@pytest.mark.asyncio
async def test_ticket_fails_after_qa_rejects_every_round(svc, tmp_path, monkeypatch):
    mission, st = _ticket(svc, tmp_path)

    async def subtask(m, s, subtasks, qa_notes=""):
        return {"verified": True, "files": ["index.html"], "summary": "built"}

    async def review(m, s, result):
        return False, "Still broken", svc.citizens["agent-qa"]

    monkeypatch.setattr(svc, "_run_mission_subtask", subtask)
    monkeypatch.setattr(svc, "_qa_review", review)
    result = await svc._run_ticket(mission, st, {})
    assert result["verified"] is False and result["error"].startswith("QA rejected after 2 rounds")


@pytest.mark.asyncio
async def test_unverified_work_skips_qa(svc, tmp_path, monkeypatch):
    mission, st = _ticket(svc, tmp_path)

    async def subtask(m, s, subtasks, qa_notes=""):
        return {"verified": False, "files": [], "error": "tests failed"}

    async def review(*a):
        raise AssertionError("QA must not review failed work")

    monkeypatch.setattr(svc, "_run_mission_subtask", subtask)
    monkeypatch.setattr(svc, "_qa_review", review)
    assert (await svc._run_ticket(mission, st, {}))["verified"] is False


@pytest.mark.asyncio
async def test_qa_review_rejects_placeholder_files_without_a_model(svc, tmp_path, monkeypatch):
    mission, st = _ticket(svc, tmp_path)
    Path(tmp_path, "index.html").write_text("<html><body>Lorem ipsum</body></html>", encoding="utf-8")

    async def no_model(*a, **k):
        raise AssertionError("static defects need no model")

    monkeypatch.setattr(svc, "_model_call", no_model)
    ok, notes, reviewer = await svc._qa_review(mission, st, {"files": ["index.html"]})
    assert not ok and "placeholder" in notes and reviewer.id == "agent-qa"


@pytest.mark.asyncio
async def test_qa_sees_the_end_of_a_long_file_and_the_gap_is_marked(svc, tmp_path, monkeypatch):
    mission, st = _ticket(svc, tmp_path)
    body = "".join(f"<p>Section {i} has real content about todos.</p>\n" for i in range(400))
    Path(tmp_path, "report.html").write_text(f"<html><body>{body}<p>THE END</p></body></html>", encoding="utf-8")
    seen = {}

    async def model(citizen, prompt, *a, **k):
        seen["prompt"] = prompt
        return '{"approved": true, "notes": "complete"}'

    monkeypatch.setattr(svc, "_model_call", model)
    ok, _, _ = await svc._qa_review(mission, st, {"files": ["report.html"]})
    assert ok and "THE END" in seen["prompt"] and "characters omitted" in seen["prompt"]


@pytest.mark.asyncio
async def test_full_mission_lands_every_ticket_in_done_with_qa_sign_off(svc, monkeypatch):
    mission, _, _ = await run(svc, monkeypatch)
    board = svc.mission_board(mission["id"])
    assert board["lead"]["role"] == "CEO/PM"
    done = board["columns"]["done"]
    assert len(done) == len(mission["subtasks"]) and all(t["qa"]["approved"] for t in done)
    assert {t["role"] for t in done} >= {"Research", "PM", "Frontend"}
    assert any(p["kind"] == "review" for p in mission["channel"])


def test_board_route(svc, monkeypatch):
    from app.main import app
    import app.api.routes_agents as routes
    monkeypatch.setattr(routes, "agent_service", svc)
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/missions/nope/board").status_code == 404
    svc.public_missions.append({"id": "m1", "title": "Site", "status": "RUNNING", "subtasks": [
        {"id": "1", "task_id": "t1", "title": "Copy", "status": "REVIEW", "assigned_agent_id": "agent-analyst",
         "assigned_agent_name": "Ana", "progress": 90}]})
    body = client.get("/api/missions/m1/board").json()
    assert [t["role"] for t in body["columns"]["review"]] == ["PM"]
    assert body["columns"]["done"] == []


@pytest.mark.asyncio
async def test_reply_cut_off_by_the_length_limit_is_continued(svc, monkeypatch):
    from app.providers.base import ModelCompletionResponse
    replies = iter([("# Report\nReact is well-suited for", "length"), (" interactive UIs. Done.", "stop")])
    sent = []

    async def fake_route(citizen, req, interactive=False):
        sent.append(req)
        text, reason = next(replies)
        return ModelCompletionResponse(content=text, model_name="m", provider_name="p",
                                       raw_metadata={"finish_reason": reason})

    monkeypatch.setattr(svc, "_route", fake_route)
    citizen = next(iter(svc.citizens.values()))
    out = await svc._model_call(citizen, "write it", "sys", continuations=2)
    assert out == "# Report\nReact is well-suited for interactive UIs. Done."
    assert len(sent) == 2 and sent[1].messages[1] == {"role": "assistant", "content": "# Report\nReact is well-suited for"}
