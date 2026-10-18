import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app, base_url="http://127.0.0.1")


@pytest.fixture(autouse=True)
def temp_database(tmp_path, monkeypatch):
    """Point the API's database at a throwaway file so tests never add projects to the real forge.db."""
    from app.api import routes_agents, routes_misc, routes_projects, routes_tasks
    for module in (routes_agents, routes_misc, routes_projects, routes_tasks):
        monkeypatch.setattr(module.db, "db_path", tmp_path / "forge-test.db")
        module.db._init_schema()
    monkeypatch.setattr(routes_projects.config, "WORKSPACES_DIR", tmp_path / "workspaces")

def test_health_check_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "FORGE AI Platform"

def test_create_and_list_projects():
    payload = {
        "name": "Integration Test Project",
        "description": "Test creating project via API",
        "budget_limit_usd": 15.0
    }
    res = client.post("/api/projects", json=payload)
    assert res.status_code == 200
    p = res.json()
    assert p["name"] == payload["name"]
    assert p["budget_limit_usd"] == 15.0

    # List projects
    list_res = client.get("/api/projects")
    assert list_res.status_code == 200
    projects = list_res.json()
    assert any(proj["id"] == p["id"] for proj in projects)

def test_emergency_stop_toggle():
    res = client.post("/api/budget/emergency-stop?active=true")
    assert res.status_code == 200
    assert res.json()["is_emergency_stopped"] is True

    res2 = client.post("/api/budget/emergency-stop?active=false")
    assert res2.status_code == 200
    assert res2.json()["is_emergency_stopped"] is False


def test_foreign_origin_cannot_call_state_changing_endpoints():
    res = client.post("/api/budget/emergency-stop?active=false", headers={"Origin": "https://evil.example"})
    assert res.status_code == 403


def test_non_loopback_host_is_rejected():
    other = TestClient(app, base_url="http://attacker.example")
    assert other.get("/health").status_code == 403


def test_local_ui_origin_is_allowed():
    res = client.post("/api/budget/emergency-stop?active=false", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200
