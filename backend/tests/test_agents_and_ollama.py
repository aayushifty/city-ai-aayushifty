"""city_ai_aayushifty Agent Execution & Ollama Integration Tests."""

import asyncio
from pathlib import Path
import pytest
from app.config import config
from app.models.database import Database
from app.models.schemas import CitizenTaskRequest, PublicMissionCreateRequest
from app.providers.ollama_provider import OllamaModelProvider
from app.providers.router import model_router
from app.execution.agent_service import CitizenExecutionService
from app.execution.task_history import TaskHistory

@pytest.fixture
def agent_service(tmp_path):
    db_file = tmp_path / "test_city.db"
    db = Database(db_file)
    svc = CitizenExecutionService(db)
    svc.workspaces_root = tmp_path / "workspaces"
    svc.workspaces_root.mkdir(parents=True, exist_ok=True)
    svc.history = TaskHistory(tmp_path / "task_history.json")  # never write test tasks into the real history
    return svc

@pytest.mark.asyncio
async def test_ollama_provider_detection_and_resolution():
    ollama = OllamaModelProvider(config.OLLAMA_BASE_URL)
    online = await ollama.is_available()
    # If Ollama is running, verify it resolves installed models
    if online:
        models = await ollama.list_models()
        assert isinstance(models, list)
        resolved = await ollama.resolve_model("qwen3:4b-instruct")
        assert resolved is not None
        assert len(resolved) > 0
    else:
        # Fallback resolution returns non-empty string
        resolved = await ollama.resolve_model("default")
        assert resolved == "default"

@pytest.mark.asyncio
async def test_model_registry_snapshot():
    snapshot = await model_router.get_registry_snapshot()
    assert "ollama_online" in snapshot
    assert "available_providers" in snapshot
    assert "active_default_provider" in snapshot
    assert snapshot["concurrency_limit"] == 1  # one local GPU: Ollama calls are serialized

def test_citizen_registry_initialization(agent_service):
    citizens = agent_service.list_citizens()
    assert len(citizens) == 15
    agent_ids = [c.id for c in citizens]
    assert "agent-coordinator" in agent_ids
    assert "agent-engineer" in agent_ids
    assert "agent-qa" in agent_ids
    assert "agent-architect" in agent_ids
    assert "agent-doctor" in agent_ids

@pytest.mark.asyncio
async def test_chat_with_citizen(agent_service):
    # Chat with Dr. Maya Lin (analyst)
    response = await agent_service.chat_with_citizen(
        "agent-analyst",
        "Governor here. What is your primary objective today?"
    )
    assert response.agent_id == "agent-analyst"
    assert response.agent_name == "Rajib Karki"
    assert len(response.reply) > 0
    assert response.model_used is not None

@pytest.mark.asyncio
async def test_individual_task_execution_produces_real_file(agent_service):
    # Assign task to Implementation Engineer
    task_req = CitizenTaskRequest(
        title="Create Math Calculator Module",
        description="Write a clean Python module with add, subtract, and multiply functions.",
        expected_deliverable="math_utils.py",
        priority="HIGH"
    )

    dispatch_res = await agent_service.dispatch_individual_task("agent-engineer", task_req)
    task_id = dispatch_res["task_id"]
    assert task_id is not None

    # Wait for background task to complete (give local Ollama model sufficient inference time)
    for _ in range(120):
        artifact = agent_service.get_artifact(task_id)
        if artifact:
            break
        await asyncio.sleep(0.5)

    artifact = agent_service.get_artifact(task_id)
    assert artifact is not None, "Task failed to produce verified deliverable artifact"
    assert Path(artifact.file_path).exists(), f"Deliverable file {artifact.file_path} was not written to disk!"
    assert artifact.file_size_bytes > 0
    assert len(artifact.content) > 0
    assert artifact.verification_summary != ""

@pytest.mark.asyncio
async def test_public_mission_dag_decomposition(agent_service):
    mission_req = PublicMissionCreateRequest(
        title="Synthesize City Traffic Simulation Service",
        description="Design and test a traffic optimization service for Avenue 1.",
        category="SOFTWARE"
    )

    mission = await agent_service.publish_public_mission(mission_req)
    assert mission["id"] is not None
    assert len(mission["subtasks"]) >= 2
    assert "agent-analyst" in mission["participating_agent_ids"] or "agent-engineer" in mission["participating_agent_ids"]
    assert mission["status"] in ["IN_PROGRESS", "COMPLETED"]

def test_computer_service_telemetry():
    from app.execution.computer_service import computer_service
    telem = computer_service.get_telemetry()
    assert "current_time" in telem
    assert "os_name" in telem
    assert "free_disk_gb" in telem
    assert "city_metrics" in telem

@pytest.mark.asyncio
async def test_chat_time_query(agent_service):
    res = await agent_service.chat_with_citizen("agent-coordinator", "What time is it right now?")
    assert res.agent_id == "agent-coordinator"
    assert "time" in res.reply.lower() or "clock" in res.reply.lower() or ":" in res.reply
    assert res.action_taken == "TIME_REPORT"

@pytest.mark.asyncio
async def test_chat_city_status_query(agent_service):
    res = await agent_service.chat_with_citizen("agent-coordinator", "Is the city functioning well?")
    assert res.agent_id == "agent-coordinator"
    assert "functioning" in res.reply.lower() or "power grid" in res.reply.lower() or "satisfaction" in res.reply.lower()
    assert res.action_taken == "CITY_STATUS_REPORT"

@pytest.mark.asyncio
async def test_chat_3d_presentation_synthesis(agent_service):
    res = await agent_service.chat_with_citizen("agent-architect", "Make a 3D presentation on Neural Quantum Systems")
    assert res.action_taken == "CREATED_3D_PRESENTATION"
    assert res.deliverable_type == "3D_PRESENTATION"
    assert res.deliverable_path is not None
    assert Path(res.deliverable_path).exists()
    assert res.deliverable_url is not None
    assert res.artifact_id is not None
    art = agent_service.get_artifact(res.artifact_id)
    assert art is not None

@pytest.mark.asyncio
async def test_chat_website_synthesis(agent_service):
    # websites are built as real multi-file projects in the background (minutes with real models): the chat
    # reply confirms the build started; the build itself is covered by test_project_builder.py
    res = await agent_service.chat_with_citizen("agent-engineer", "Make a website for a Cybernetic Space Port")
    assert res.action_taken == "PROJECT_STARTED"
    rec = next(r for r in agent_service.history.list() if r["kind"] == "TASK")
    assert rec["agent_id"] == "agent-engineer" and "Cybernetic Space Port" in rec["title"]
    assert await agent_service.cancel_task(rec["task_id"]) is True

@pytest.mark.asyncio
async def test_chat_greeting_human_language_not_json(agent_service):
    # Verify that casual greetings like "whats up" return in-character human dialogue, NEVER raw mock JSON
    res = await agent_service.chat_with_citizen("agent-diagnostic", "whats up")
    assert res.agent_id == "agent-diagnostic"
    assert not res.reply.strip().startswith("{"), f"AI returned raw JSON instead of human language: {res.reply}"
    assert "Task completed deterministically" not in res.reply
    assert "solution.py" not in res.reply
    assert "Supreme Governor" in res.reply
    assert len(res.reply) > 20

@pytest.mark.asyncio
async def test_assign_task_3d_presentation_guaranteed_success(agent_service):
    # Assign 3D presentation as a formal background task to Dr. Aaron Chen / Marcus Vance
    task_req = CitizenTaskRequest(
        title="Create a 3D presentation on Autonomous Metropolis Systems",
        description="Build an interactive Three.js 3D presentation with dynamic camera navigation and orbital geometry.",
        expected_deliverable="metropolis_3d.html",
        priority="CRITICAL"
    )

    dispatch_res = await agent_service.dispatch_individual_task("agent-architect", task_req)
    task_id = dispatch_res["task_id"]
    assert task_id is not None

    # Wait for completion: writing the slides on the local GPU takes about 80 s, so allow up to 4 minutes
    # (stop early if the task ends without a deliverable)
    for _ in range(480):
        artifact = agent_service.get_artifact(task_id)
        if artifact:
            break
        rec = agent_service.history.get(task_id)
        if rec and rec.get("status") in ("FAILED", "CANCELLED"):
            break
        await asyncio.sleep(0.5)

    artifact = agent_service.get_artifact(task_id)
    assert artifact is not None, "Task failed to create deliverable artifact"
    assert Path(artifact.file_path).exists(), f"Presentation file {artifact.file_path} missing!"
    assert artifact.file_size_bytes > 500
    assert "three" in artifact.content.lower() or "webgl" in artifact.content.lower()
    assert artifact.verification_exit_code == 0

    citizen = agent_service.get_citizen("agent-architect")
    assert citizen.status in ["COMPLETED", "IDLE"]
    assert citizen.work_progress == 100.0


