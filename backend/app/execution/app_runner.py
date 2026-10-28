"""Runs delivered projects as live servers on loopback ports, so a mission's link is a real, usable app.

A project with a FastAPI ``server.py``/``main.py``/``app.py`` runs under uvicorn, one with ``server.js`` runs under
Node, anything else is served as static files. Every server binds to 127.0.0.1 only and gets a free port."""

from __future__ import annotations

import difflib
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import config

LOG_DIR = config.DATA_DIR / "app_logs"
HEALTH_TIMEOUT_S = 20.0
SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".venv", "venv"}
MAX_EDIT_BYTES = 1_000_000


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def detect_kind(project: Path) -> Dict[str, str]:
    """Which server a project needs: {"kind": "fastapi"|"node"|"static", "module"?: "server"}."""
    for name in ("server.py", "main.py", "app.py"):
        f = project / name
        if f.is_file() and re.search(r"FastAPI\s*\(", f.read_text(encoding="utf-8", errors="replace")):
            return {"kind": "fastapi", "module": f.stem}
    if (project / "server.js").is_file():
        return {"kind": "node"}
    return {"kind": "static"}


def command_for(project: Path, kind: Dict[str, str], port: int) -> List[str]:
    if kind["kind"] == "fastapi":
        return [sys.executable, "-m", "uvicorn", f"{kind['module']}:app", "--host", "127.0.0.1", "--port", str(port)]
    if kind["kind"] == "node":
        return ["node", "server.js"]
    return [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(project)]


def http_ok(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return 200 <= r.status < 400
    except Exception:
        return False


class AppRunner:
    """Registry of running delivered apps. Thread-safe; processes are killed on stop and at shutdown."""

    def __init__(self) -> None:
        self._apps: Dict[str, Dict[str, Any]] = {}
        self._procs: Dict[str, subprocess.Popen] = {}
        self._lock = threading.Lock()

    def start(self, project: Path, name: str = "", task_id: str = "", wait: bool = True) -> Dict[str, Any]:
        """Launches the project on a free loopback port and, with ``wait``, blocks until it answers HTTP 200."""
        project = Path(project).resolve()
        if not project.is_dir():
            raise FileNotFoundError(f"Project folder not found: {project}")
        app_id = f"app-{uuid.uuid4().hex[:8]}"
        rec = {"id": app_id, "task_id": task_id, "name": (name or project.name)[:80], "dir": str(project),
               "kind": detect_kind(project)["kind"], "port": None, "url": None, "status": "starting", "pid": None,
               "started_at": None, "error": None}
        with self._lock:
            self._apps[app_id] = rec
        self._launch(app_id, wait)
        return dict(self._apps[app_id])

    def _launch(self, app_id: str, wait: bool) -> None:
        rec = self._apps[app_id]
        project = Path(rec["dir"])
        kind = detect_kind(project)
        port = free_port()
        env = {**os.environ, "PORT": str(port), "HOST": "127.0.0.1", "PYTHONUNBUFFERED": "1"}
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log = open(LOG_DIR / f"{app_id}.log", "ab")
        flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        try:
            proc = subprocess.Popen(command_for(project, kind, port), cwd=str(project), env=env, stdout=log,
                                    stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=flags)
        except OSError as ex:
            log.close()
            rec.update(status="crashed", error=str(ex)[:300])
            return
        log.close()
        with self._lock:
            self._procs[app_id] = proc
            rec.update(kind=kind["kind"], port=port, url=f"http://127.0.0.1:{port}/", pid=proc.pid,
                       status="starting", started_at=time.strftime("%I:%M %p"), error=None)
        if wait:
            self.wait_healthy(app_id)

    def wait_healthy(self, app_id: str, timeout: float = HEALTH_TIMEOUT_S) -> bool:
        rec, proc = self._apps.get(app_id), self._procs.get(app_id)
        if not rec or not proc:
            return False
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                rec.update(status="crashed", error=f"exited with code {proc.returncode}: {self.logs(app_id, 600)}")
                return False
            if http_ok(rec["url"]):
                rec["status"] = "running"
                return True
            time.sleep(0.25)
        rec.update(status="unhealthy", error=f"no HTTP 200 within {timeout:.0f}s")
        return False

    def stop(self, app_id: str) -> Optional[Dict[str, Any]]:
        rec = self._apps.get(app_id)
        if rec is None:
            return None
        proc = self._procs.pop(app_id, None)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        rec.update(status="stopped", pid=None)
        return dict(rec)

    def restart(self, app_id: str) -> Optional[Dict[str, Any]]:
        if self.stop(app_id) is None:
            return None
        self._launch(app_id, wait=True)
        return dict(self._apps[app_id])

    def get(self, app_id: str) -> Optional[Dict[str, Any]]:
        rec = self._apps.get(app_id)
        if rec is None:
            return None
        proc = self._procs.get(app_id)
        if rec["status"] == "running" and proc is not None and proc.poll() is not None:
            rec.update(status="crashed", error=f"exited with code {proc.returncode}")
        return dict(rec)

    def list(self) -> List[Dict[str, Any]]:
        return [a for a in (self.get(i) for i in list(self._apps)[::-1]) if a]

    def by_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return next((a for a in self.list() if a["task_id"] == task_id), None)

    def logs(self, app_id: str, tail: int = 4000) -> str:
        f = LOG_DIR / f"{app_id}.log"
        if not f.is_file():
            return ""
        return f.read_bytes()[-tail:].decode("utf-8", errors="replace")

    # --- IDE: the files of a running app, confined to its folder ---

    def _path(self, app_id: str, rel: str = "") -> Path:
        rec = self._apps.get(app_id)
        if rec is None:
            raise LookupError("App not found")
        root = Path(rec["dir"]).resolve()
        target = (root / rel).resolve()
        if target != root and root not in target.parents:
            raise PermissionError("Path is outside the app folder")
        return target

    def files(self, app_id: str) -> List[Dict[str, Any]]:
        """Every file of the app (relative POSIX paths and sizes), skipping dependency and cache folders."""
        root = self._path(app_id)
        out = []
        for f in sorted(root.rglob("*")):
            rel = f.relative_to(root)
            if f.is_file() and not SKIP_DIRS.intersection(rel.parts):
                out.append({"path": rel.as_posix(), "size": f.stat().st_size})
        return out[:2000]

    def read_file(self, app_id: str, rel: str) -> str:
        f = self._path(app_id, rel)
        if not f.is_file():
            raise FileNotFoundError(rel)
        if f.stat().st_size > MAX_EDIT_BYTES:
            raise ValueError("File is too large to open in the editor")
        return f.read_text(encoding="utf-8", errors="replace")

    def write_file(self, app_id: str, rel: str, content: str) -> Dict[str, Any]:
        """Saves a file inside the app folder and returns the unified diff against what was there."""
        f = self._path(app_id, rel)
        if f == self._path(app_id) or len(content.encode("utf-8")) > MAX_EDIT_BYTES:
            raise ValueError("Invalid file path or content too large")
        old = f.read_text(encoding="utf-8", errors="replace") if f.is_file() else ""
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content, encoding="utf-8")
        diff = "".join(difflib.unified_diff(old.splitlines(True), content.splitlines(True), f"a/{rel}", f"b/{rel}"))
        return {"path": rel, "diff": diff, "changed": old != content}

    def stop_all(self) -> None:
        for app_id in list(self._procs):
            try:
                self.stop(app_id)
            except Exception:
                pass


app_runner = AppRunner()
