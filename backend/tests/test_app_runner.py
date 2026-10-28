"""Delivered projects run as live loopback servers: static sites, and FastAPI + SQLite data apps."""

import json
import urllib.request

import pytest
from fastapi.testclient import TestClient

from app.api import routes_agents as routes
from app.execution import app_runner as runner_mod
from app.execution.app_runner import AppRunner, command_for, detect_kind, http_ok
from app.execution.project_builder import SERVER_PY, SERVER_TEMPLATE, Plan, ProjectBuilder, wants_backend
from app.main import app


def _req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=5) as resp:
        return resp.status, json.loads(resp.read() or b"null")


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setattr(runner_mod, "LOG_DIR", tmp_path / "logs")
    r = AppRunner()
    yield r
    r.stop_all()


def test_detect_kind_and_command(tmp_path):
    assert detect_kind(tmp_path) == {"kind": "static"}
    cmd = command_for(tmp_path, {"kind": "static"}, 5000)
    assert "127.0.0.1" in cmd and "5000" in cmd
    (tmp_path / "server.py").write_text(SERVER_TEMPLATE, encoding="utf-8")
    assert detect_kind(tmp_path) == {"kind": "fastapi", "module": "server"}
    cmd = command_for(tmp_path, detect_kind(tmp_path), 5001)
    assert cmd[-4:] == ["--host", "127.0.0.1", "--port", "5001"]


def test_static_site_runs_on_loopback_and_stops(runner, tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<h1>Hello</h1>", encoding="utf-8")
    rec = runner.start(site, name="Hello", task_id="t1")
    assert rec["status"] == "running", rec
    assert rec["url"].startswith("http://127.0.0.1:")
    assert http_ok(rec["url"])
    assert runner.by_task("t1")["id"] == rec["id"]
    stopped = runner.stop(rec["id"])
    assert stopped["status"] == "stopped" and not http_ok(rec["url"], timeout=1)
    again = runner.restart(rec["id"])
    assert again["status"] == "running" and http_ok(again["url"])


def test_fastapi_data_app_persists_items(runner, tmp_path):
    proj = tmp_path / "todo"
    proj.mkdir()
    (proj / "index.html").write_text("<h1>Todo</h1>", encoding="utf-8")
    (proj / SERVER_PY).write_text(SERVER_TEMPLATE, encoding="utf-8")
    rec = runner.start(proj, name="Todo")
    assert rec["status"] == "running" and rec["kind"] == "fastapi", rec
    base = rec["url"].rstrip("/")
    assert _req(base + "/api/health")[0] == 200
    status, item = _req(base + "/api/items/todos", "POST", {"text": "buy milk"})
    assert status in (200, 201) and item["text"] == "buy milk"
    items = _req(base + "/api/items/todos")[1]
    assert [i["text"] for i in items] == ["buy milk"]
    _req(f"{base}/api/items/todos/{item['id']}", "DELETE")
    assert _req(base + "/api/items/todos")[1] == []
    assert (proj / "data.db").is_file()
    with urllib.request.urlopen(base + "/", timeout=5) as r:
        assert b"Todo" in r.read()


def test_crashing_app_is_reported(runner, tmp_path):
    proj = tmp_path / "broken"
    proj.mkdir()
    (proj / "server.py").write_text("from fastapi import FastAPI\napp = FastAPI(\nraise SystemExit(3)\n", encoding="utf-8")
    rec = runner.start(proj)
    assert rec["status"] == "crashed" and rec["error"]


def test_wants_backend():
    assert wants_backend("build me a todo app")
    assert wants_backend("a notes app that saves entries")
    assert not wants_backend("a portfolio site for a photographer")


def test_scaffold_writes_server_for_data_apps(tmp_path):
    builder = ProjectBuilder.__new__(ProjectBuilder)
    plan = Plan(name="todo", summary="", files=[{"path": SERVER_PY, "purpose": "", "requirements": [], "generated": True}])
    builder.write_scaffold(tmp_path, plan, [])
    assert (tmp_path / SERVER_PY).read_text(encoding="utf-8") == SERVER_TEMPLATE


def test_app_routes(monkeypatch, tmp_path):
    monkeypatch.setattr(runner_mod, "LOG_DIR", tmp_path / "logs")
    r = AppRunner()
    monkeypatch.setattr(routes, "app_runner", r)
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/apps").json() == []
    assert client.post("/api/apps/nope/stop").status_code == 404
    assert client.post("/api/apps/nope/explode").status_code == 400
    assert client.get("/api/apps/nope/logs").status_code == 404
    site = tmp_path / "s"
    site.mkdir()
    (site / "index.html").write_text("hi", encoding="utf-8")
    rec = r.start(site, name="S")
    try:
        assert client.get("/api/apps").json()[0]["id"] == rec["id"]
        assert client.post(f"/api/apps/{rec['id']}/stop").json()["status"] == "stopped"
        assert client.get(f"/api/apps/{rec['id']}/logs").status_code == 200
    finally:
        r.stop_all()
