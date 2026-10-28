"""Speed-up helpers: batched writes, the mechanical import/id fixer, repeat-error detection,
the planner's content-step filter and the one-round QA for documents."""
import asyncio
from pathlib import Path

from app.execution import project_builder as pb
from app.execution.agent_service import CitizenExecutionService, _content_steps_only


def test_chunk_balances_groups():
    assert [len(g) for g in pb._chunk(list(range(7)), 3)] == [3, 2, 2]
    assert pb._chunk([], 3) == []
    assert pb._chunk([1, 2], 3) == [[1, 2]]


def test_split_files_keeps_only_expected_paths():
    raw = "=== FILE: index.html ===\n<html></html>\n=== FILE: js/app.js ===\nconsole.log(1)\n=== FILE: evil.sh ===\nrm\n"
    out = pb._split_files(raw, ["index.html", "js/app.js"])
    assert set(out) == {"index.html", "js/app.js"}
    assert "console.log(1)" in out["js/app.js"]


def test_error_signature_ignores_line_numbers():
    a = pb.error_signature("Traceback\n  File x.py, line 12\nNameError: foo")
    b = pb.error_signature("Traceback\n  File x.py, line 40\nNameError: foo")
    assert a == b
    assert a != pb.error_signature("Traceback\nTypeError: bar")
    assert pb.error_signature({"app.js": ["missing id 'list' at 3"]}) == pb.error_signature({"app.js": ["missing id 'list' at 9"]})


def test_fix_imports_and_ids(tmp_path: Path):
    (tmp_path / "js").mkdir()
    (tmp_path / "index.html").write_text('<html><body><ul id="todo-list"></ul>'
                                         '<script type="module" src="js/app.js"></script></body></html>')
    (tmp_path / "js" / "util.js").write_text("export function formatDate(d) { return d; }\n")
    (tmp_path / "js" / "app.js").write_text("import { formatDat } from './util.js';\n"
                                            "document.getElementById('todo_list');\n")
    notes = pb.fix_imports_and_ids(tmp_path)
    app = (tmp_path / "js" / "app.js").read_text()
    assert notes
    assert "import { formatDate as formatDat }" in app      # aliased, so the existing call sites keep working
    assert "'todo-list'" in app


def test_content_steps_only_drops_code_and_tests():
    steps = [{"title": "Copy", "expected_deliverable": "copy.md"},
             {"title": "Django models", "expected_deliverable": "models.py"},
             {"title": "Write pytest suite", "expected_deliverable": "tests.md"},
             {"title": "Design", "expected_deliverable": "design.json"},
             {"title": "A", "expected_deliverable": "a.md"},
             {"title": "B", "expected_deliverable": "b.md"}]
    assert [s["title"] for s in _content_steps_only(steps)] == ["Copy", "Design", "A"]


def test_document_ticket_gets_one_qa_round():
    svc = CitizenExecutionService.__new__(CitizenExecutionService)
    calls = {"run": 0, "qa": 0}

    async def run(mission, st, subtasks, qa_notes=None):
        calls["run"] += 1
        return {"verified": True}

    async def qa(mission, st, result):
        calls["qa"] += 1

        class R:
            id, name = "agent-qa", "QA"
        return False, "tighten the copy", R()

    svc._run_mission_subtask = run
    svc._qa_review = qa                     # type: ignore[assignment]
    svc._post = lambda *a, **k: None        # type: ignore[assignment]
    st = {"title": "Copy", "expected_deliverable": "copy.md", "task_id": "t1"}
    result = asyncio.run(svc._run_ticket({}, st, {}))
    assert calls == {"run": 2, "qa": 1}
    assert result["verified"] is True
