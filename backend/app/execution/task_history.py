"""Task history: one record per citizen task (chat deliverables, assigned tasks and mission subtasks).

Records hold live status/progress, deliverable links and the honest verification result, and are
persisted to a JSON file so the HUD can show history across backend restarts.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger("city_ai.task_history")

TERMINAL_STATUSES = {"VERIFIED", "FAILED", "BLOCKED", "CANCELLED"}
MAX_RECORDS = 500


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class TaskHistory:
    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path else None
        self._records: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self.path or not self.path.is_file():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            for rec in data if isinstance(data, list) else []:
                if isinstance(rec, dict) and rec.get("task_id"):
                    # A task still "running" when the backend stopped can never finish now.
                    if rec.get("status") not in TERMINAL_STATUSES:
                        rec["status"] = "FAILED"
                        rec["notes"] = (rec.get("notes") or []) + ["Backend restarted before the task finished."]
                        rec["completed_at"] = rec.get("completed_at") or rec.get("updated_at")
                    self._records[rec["task_id"]] = rec
        except Exception as ex:
            logger.warning(f"Could not load task history from {self.path}: {ex}")

    def _save(self) -> None:
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(list(self._records.values()), ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self.path)
        except Exception as ex:
            logger.warning(f"Could not save task history: {ex}")

    def start(self, task_id: str, agent_id: str, agent_name: str, title: str, kind: str = "TASK",
              mission_id: Optional[str] = None, status: str = "QUEUED") -> Dict[str, Any]:
        now = _now()
        rec = {
            "task_id": task_id,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "title": title,
            "kind": kind,
            "mission_id": mission_id,
            "status": status,
            "progress": 0.0,
            "stage": status.lower(),
            "deliverables": [],
            "verification": None,
            "notes": [],
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }
        with self._lock:
            self._records[task_id] = rec
            if len(self._records) > MAX_RECORDS:
                oldest = sorted(self._records.values(), key=lambda r: r["updated_at"])[: len(self._records) - MAX_RECORDS]
                for r in oldest:
                    self._records.pop(r["task_id"], None)
            self._save()
        return rec

    def update(self, task_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
        with self._lock:
            rec = self._records.get(task_id)
            if rec is None:
                return None
            note = fields.pop("note", None)
            if note:
                rec["notes"].append(note)
            rec.update(fields)
            rec["updated_at"] = _now()
            if rec["status"] in TERMINAL_STATUSES and not rec.get("completed_at"):
                rec["completed_at"] = rec["updated_at"]
            self._save()
            return dict(rec)

    def add_deliverable(self, task_id: str, path: str, url: Optional[str] = None, title: Optional[str] = None) -> None:
        with self._lock:
            rec = self._records.get(task_id)
            if rec is None:
                return
            if not any(d["path"] == path for d in rec["deliverables"]):
                rec["deliverables"].append({"path": path, "url": url, "title": title})
            rec["updated_at"] = _now()
            self._save()

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        rec = self._records.get(task_id)
        return dict(rec) if rec else None

    def list(self, limit: int = 100, agent_id: Optional[str] = None, mission_id: Optional[str] = None) -> List[Dict[str, Any]]:
        recs = list(reversed(self._records.values()))  # newest first (insertion order)
        if agent_id:
            recs = [r for r in recs if r["agent_id"] == agent_id]
        if mission_id:
            recs = [r for r in recs if r.get("mission_id") == mission_id]
        return [dict(r) for r in recs[:limit]]
