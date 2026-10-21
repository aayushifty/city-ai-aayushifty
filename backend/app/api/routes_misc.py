"""FORGE AI Memory, Approvals, Budget, and WebSocket Telemetry Routes."""

import json
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from typing import List, Optional
from app.models.schemas import (
    ProjectMemoryEntry, ApprovalRequest, ApprovalStatus, BudgetStatus
)
from app.models.database import Database
from app.config import config
from app.budget.manager import BudgetManager
from app.core.event_bus import event_bus, ForgeEvent

db = Database(config.DB_PATH)
budget_mgr = BudgetManager(db)

# --- Memory Router ---
memory_router = APIRouter(prefix="/api/memory", tags=["memory"])

@memory_router.get("/{project_id}", response_model=List[ProjectMemoryEntry])
def get_project_memory(project_id: str):
    return db.list_memory_entries(project_id)

# --- Approvals Router ---
approval_router = APIRouter(prefix="/api/approvals", tags=["approvals"])

@approval_router.get("/{project_id}", response_model=List[ApprovalRequest])
def list_approvals(project_id: str):
    return db.list_approvals_for_project(project_id)

@approval_router.post("/{approval_id}/decide")
def decide_approval(approval_id: str, approved: bool, note: Optional[str] = None):
    status = ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED
    db.update_approval_status(approval_id, status, note)
    return {"status": status.value, "approval_id": approval_id}

# --- Budget Router ---
budget_router = APIRouter(prefix="/api/budget", tags=["budget"])

@budget_router.get("/{project_id}", response_model=BudgetStatus)
def get_project_budget(project_id: str):
    return budget_mgr.get_budget_status(project_id)

@budget_router.post("/emergency-stop")
def toggle_emergency_stop(active: bool):
    if active:
        budget_mgr.trigger_emergency_stop()
        from app.execution.approvals import approval_broker
        approval_broker.deny_all()
    else:
        budget_mgr.resume_emergency_stop()
    return {"is_emergency_stopped": active}

# --- WebSocket Telemetry Router ---
ws_router = APIRouter(tags=["telemetry"])

@ws_router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    async def _send_event(event: ForgeEvent):
        try:
            await websocket.send_text(json.dumps(event.model_dump(), default=str))
        except Exception:
            pass

    event_bus.subscribe_all(_send_event)
    try:
        while True:
            # Keep alive and receive any client ping
            await websocket.receive_text()
    except WebSocketDisconnect:
        event_bus.unsubscribe_all(_send_event)
