"""city_ai_aayushifty Agent, Model & Mission REST API Endpoints."""

from typing import List, Dict, Any, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import PlainTextResponse, HTMLResponse

from app.models.database import Database
from app.config import config
from pydantic import BaseModel
from app.models.schemas import (
    CitizenProfile, CitizenChatMessageRequest, CitizenChatResponse,
    CitizenTaskRequest, PublicMissionCreateRequest, DeliverableArtifact
)
from app.providers.router import model_router
from app.execution.agent_service import CitizenExecutionService
from app.execution.computer_service import computer_service
from app.execution.approvals import approval_broker
from app.config import FREE_MODEL_CATALOG

router = APIRouter(prefix="/api", tags=["agents_and_missions"])
db = Database(config.DB_PATH)
agent_service = CitizenExecutionService(db)

# --- 1. Model Registry & Local Inference Discovery ---

@router.get("/models")
async def get_model_registry():
    """Returns real-time status of local Ollama runtime and detected models."""
    return await model_router.get_registry_snapshot()

# --- 2. Persistent AI Citizens ---

class ModelAssignment(BaseModel):
    provider: str = "ollama"
    model: str

@router.put("/agents/{agent_id}/model", response_model=CitizenProfile)
def assign_agent_model(agent_id: str, payload: ModelAssignment):
    """Switches the model a citizen thinks with (any entry of the free model catalog, or any installed Ollama model)."""
    c = agent_service.get_citizen(agent_id)
    if not c:
        raise HTTPException(status_code=404, detail="Agent not found")
    if model_router.get_provider(payload.provider) is None or payload.provider == "mock":
        raise HTTPException(status_code=400, detail=f"Unknown provider '{payload.provider}'")
    c.provider_key = payload.provider
    c.assigned_model = payload.model
    label = next((m["label"] for m in FREE_MODEL_CATALOG if m["model"] == payload.model), payload.model)
    c.provider = "Ollama (Local)" if payload.provider == "ollama" else f"{payload.provider} (free tier)"
    c.thought = f"Now thinking with {label}."
    return c

# --- Host action approvals (Approve/Deny in the 3D HUD) ---

class ApprovalDecision(BaseModel):
    approved: bool

@router.get("/host-approvals")
def list_host_approvals():
    return {"pending": approval_broker.list_pending(), "recent": approval_broker.list_recent()}

@router.post("/host-approvals/{request_id}/decide")
def decide_host_approval(request_id: str, payload: ApprovalDecision):
    if not approval_broker.decide(request_id, payload.approved):
        raise HTTPException(status_code=404, detail="Approval request not found or already decided")
    return {"id": request_id, "approved": payload.approved}

@router.get("/agents", response_model=List[CitizenProfile])
def list_agents():
    """Returns all 15 persistent AI citizens with real status and deliverables."""
    return agent_service.list_citizens()

@router.get("/agents/{agent_id}", response_model=CitizenProfile)
def get_agent(agent_id: str):
    c = agent_service.get_citizen(agent_id)
    if not c:
        raise HTTPException(status_code=404, detail="Agent not found")
    return c

@router.post("/agents/{agent_id}/chat", response_model=CitizenChatResponse)
async def chat_with_agent(agent_id: str, payload: CitizenChatMessageRequest):
    """Direct 2-way conversation with a citizen powered by local Ollama models."""
    try:
        return await agent_service.chat_with_citizen(agent_id, payload.message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@router.post("/agents/{agent_id}/tasks")
async def assign_individual_task(agent_id: str, payload: CitizenTaskRequest):
    """Assigns a real task to an agent; initiates sandboxed execution loop and verification."""
    try:
        return await agent_service.dispatch_individual_task(agent_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Task dispatch failed: {str(e)}")

# --- 3. Artifact Inspection & Verification Deliverables ---

@router.get("/artifacts/{task_id}", response_model=DeliverableArtifact)
def get_deliverable_artifact(task_id: str):
    """Inspects the actual deliverable produced by an agent."""
    artifact = agent_service.get_artifact(task_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Deliverable artifact not found for this task")
    return artifact

@router.get("/artifacts/{task_id}/content")
def get_deliverable_content(task_id: str):
    """Returns raw text or source code of deliverable artifact."""
    artifact = agent_service.get_artifact(task_id)
    if not artifact or not artifact.content:
        raise HTTPException(status_code=404, detail="Artifact content not found")
    return PlainTextResponse(artifact.content)

@router.get("/deliverables/view/{artifact_id}")
def view_deliverable_html(artifact_id: str):
    """Renders the generated 3D presentation or website directly as HTML."""
    artifact = agent_service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    file_p = Path(artifact.file_path)
    if not file_p.exists():
        raise HTTPException(status_code=404, detail="Deliverable file missing on disk")
    
    html_data = file_p.read_text(encoding="utf-8", errors="replace")
    return HTMLResponse(content=html_data, media_type="text/html")

@router.post("/deliverables/open/{artifact_id}")
def open_deliverable_desktop(artifact_id: str):
    """Launches the synthesized website or 3D presentation directly on the user's host computer desktop."""
    artifact = agent_service.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    launched = computer_service.open_on_desktop(artifact.file_path)
    if not launched:
        raise HTTPException(status_code=500, detail="Failed to launch deliverable on host desktop")
    
    return {
        "success": True,
        "message": f"Successfully launched '{artifact.title}' in default browser.",
        "file_path": artifact.file_path
    }

@router.get("/system/telemetry")
def get_host_telemetry():
    """Returns real-time host computer specifications, clock, and city operational metrics."""
    return computer_service.get_telemetry()

# --- 4. Public Missions Coordination ---

@router.post("/missions")
async def publish_public_mission(payload: PublicMissionCreateRequest):
    """Publishes a city-wide national mission, auto-decomposing into multi-agent DAG subtasks."""
    try:
        return await agent_service.publish_public_mission(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to publish mission: {str(e)}")

@router.get("/missions")
def list_public_missions():
    """Lists all active and completed public missions with subtask dependencies."""
    return agent_service.list_public_missions()

# --- 5. Cancellation & Task Management ---

@router.get("/task-history")
def get_task_history(limit: int = Query(100, ge=1, le=500), agent_id: Optional[str] = None,
                     mission_id: Optional[str] = None):
    """Every citizen task (chat deliverables, assigned tasks, mission subtasks), newest first, with live
    status/progress, deliverable links and the verification result."""
    return {"tasks": agent_service.list_task_history(limit=limit, agent_id=agent_id, mission_id=mission_id)}

@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Safely cancels an active task execution."""
    success = await agent_service.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or already completed")
    return {"status": "CANCELLED", "task_id": task_id}


# --- 6. Full Host Computer Control (Supreme Governor / Jarvis Tier) ---

class ComputerCommandRequest(BaseModel):
    command: str
    timeout: int = 30

class AppLaunchRequest(BaseModel):
    target: str

class FileReadRequest(BaseModel):
    path: str
    max_chars: int = 40000

class FileWriteRequest(BaseModel):
    path: str
    content: str

@router.post("/computer/execute")
def execute_computer_command(payload: ComputerCommandRequest):
    """Executes a real shell / PowerShell command on the host machine."""
    return computer_service.execute_shell_command(payload.command, timeout=payload.timeout)

@router.post("/computer/launch-app")
def launch_computer_app(payload: AppLaunchRequest):
    """Launches an application, executable, or desktop tool on the host Windows machine."""
    return computer_service.launch_application(payload.target)

@router.post("/computer/read-file")
def read_computer_file(payload: FileReadRequest):
    """Reads file content directly from the host filesystem."""
    return computer_service.read_host_file(payload.path, max_chars=payload.max_chars)

@router.post("/computer/write-file")
def write_computer_file(payload: FileWriteRequest):
    """Writes or creates a file on the host filesystem."""
    return computer_service.write_host_file(payload.path, payload.content)

@router.get("/computer/list-dir")
def list_computer_dir(path: str = "."):
    """Lists files and folders inside a host directory."""
    return computer_service.list_directory(path)

@router.get("/computer/diagnostics")
def get_computer_diagnostics():
    """Returns deep Jarvis-tier system diagnostics (processes, CPU, RAM, GPU, network)."""
    return computer_service.get_deep_diagnostics()


