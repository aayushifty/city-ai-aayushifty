"""Host-action approval broker.

Agents never touch the host directly. A host command, app launch or file write outside the workspace
is registered here as a pending request, announced on the event bus, and the agent's tool awaits the
Governor's Approve/Deny click in the 3D HUD. Unanswered requests expire as denied, and the Emergency
Stop denies everything pending.
"""

import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.event_bus import event_bus, ForgeEvent

APPROVAL_TIMEOUT_SECONDS = 600


class ApprovalBroker:
    def __init__(self) -> None:
        self._pending: Dict[str, Dict[str, Any]] = {}
        self._futures: Dict[str, asyncio.Future] = {}
        self._history: List[Dict[str, Any]] = []

    def list_pending(self) -> List[Dict[str, Any]]:
        return list(self._pending.values())

    def list_recent(self, limit: int = 30) -> List[Dict[str, Any]]:
        return self._history[-limit:][::-1]

    async def request(self, agent_id: str, agent_name: str, kind: str, summary: str,
                      detail: Dict[str, Any], task_id: Optional[str] = None,
                      timeout: float = APPROVAL_TIMEOUT_SECONDS) -> bool:
        """Registers a request and waits for the Governor's decision. Returns True only if approved."""
        req_id = f"appr-{uuid.uuid4().hex[:8]}"
        item = {
            "id": req_id,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "kind": kind,              # "command" | "launch" | "write_file"
            "summary": summary,
            "detail": detail,
            "task_id": task_id,
            "status": "PENDING",
            "requested_at": datetime.now().strftime("%I:%M:%S %p"),
        }
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[req_id] = item
        self._futures[req_id] = fut
        await event_bus.publish(ForgeEvent(event_id=uuid.uuid4().hex, topic="approval:requested", payload=item))
        try:
            approved = await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            approved = False
            item["status"] = "EXPIRED"
        finally:
            self._pending.pop(req_id, None)
            self._futures.pop(req_id, None)
        if item["status"] == "PENDING":
            item["status"] = "APPROVED" if approved else "DENIED"
        self._history.append(item)
        await event_bus.publish(ForgeEvent(event_id=uuid.uuid4().hex, topic="approval:resolved", payload=item))
        return approved

    def decide(self, req_id: str, approved: bool) -> bool:
        fut = self._futures.get(req_id)
        if not fut or fut.done():
            return False
        self._pending[req_id]["status"] = "APPROVED" if approved else "DENIED"
        fut.set_result(approved)
        return True

    def deny_all(self) -> int:
        count = 0
        for req_id in list(self._futures):
            if self.decide(req_id, False):
                count += 1
        return count


approval_broker = ApprovalBroker()
