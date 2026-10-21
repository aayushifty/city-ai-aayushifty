"""City AI desktop app: runs the backend in-process and shows the 3D city in a native Windows window.

Double-click the "City AI" shortcut (see install_shortcuts.ps1), or run:
    pythonw desktop\\city_ai_desktop.py            (no console)
    python  desktop\\city_ai_desktop.py --rebuild  (rebuild the 3D city UI first)

What it does:
1. Starts Ollama (`ollama serve`) if it is installed but not running.
2. Builds frontend/dist with `npm run build` if it is missing (or with --rebuild).
3. Starts the FastAPI backend on http://127.0.0.1:8000 in a background thread
   (or reuses one that is already running, e.g. a second launch).
4. Opens the city in a native window (Edge WebView2 via pywebview). Closing the window stops the backend.
   Without pywebview it falls back to Microsoft Edge in app mode.
"""

import argparse
import json
import logging
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request

# Laptops with two GPUs give WebView2 the power-saving one by default; ask Chromium for the
# high-performance GPU (the 3D city renders on the RTX 3050 instead of the integrated chip).
_extra = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "")
if "--force_high_performance_gpu" not in _extra:
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (_extra + " --force_high_performance_gpu").strip()

try:
    import webview  # imported before the backend changes the working directory (pywebview reads it at import)
except ImportError:
    webview = None

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
ICON = Path(__file__).resolve().parent / "city_ai.ico"
HOST, PORT = "127.0.0.1", 8000
APP_URL = f"http://{HOST}:{PORT}/"
OLLAMA_URL = "http://127.0.0.1:11434/api/tags"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

(BACKEND / "data").mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    filename=str(BACKEND / "data" / "desktop.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("city_ai.desktop")


def _get(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read()
    except Exception:
        return None, b""


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, port)) == 0


def _city_backend_running() -> bool:
    status, body = _get(f"http://{HOST}:{PORT}/health")
    if status != 200:
        return False
    try:
        return json.loads(body).get("project") == "city_ai_aayushifty"
    except Exception:
        return False


def _message_box(text: str, title: str = "City AI") -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, title, 0x10)
    except Exception:
        print(f"{title}: {text}", file=sys.stderr)


def ensure_ollama() -> None:
    if _get(OLLAMA_URL)[0] == 200:
        log.info("Ollama already running")
        return
    exe = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama.exe"
    exe_path = str(exe) if exe.is_file() else shutil.which("ollama")
    if not exe_path:
        log.warning("Ollama not installed; citizens will fall back to other providers")
        return
    log.info(f"Starting Ollama: {exe_path} serve")
    subprocess.Popen([exe_path, "serve"], creationflags=NO_WINDOW | getattr(subprocess, "DETACHED_PROCESS", 0),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    for _ in range(20):
        if _get(OLLAMA_URL)[0] == 200:
            return
        time.sleep(0.5)
    log.warning("Ollama did not answer within 10 s; continuing")


def ensure_frontend(rebuild: bool) -> None:
    if (FRONTEND / "dist" / "index.html").is_file() and not rebuild:
        return
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("frontend/dist is missing and npm was not found. Install Node.js, then run "
                           "`npm install` and `npm run build` in the frontend folder.")
    log.info("Building the 3D city UI (npm run build)...")
    if not (FRONTEND / "node_modules").is_dir():
        subprocess.run([npm, "install"], cwd=FRONTEND, check=True, creationflags=NO_WINDOW)
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True, creationflags=NO_WINDOW)


def start_backend():
    """Starts uvicorn in a daemon thread and returns the server (or None when reusing a running one)."""
    if _city_backend_running():
        log.info("Reusing the City AI backend already running on port 8000")
        return None
    if _port_in_use(PORT):
        raise RuntimeError(f"Port {PORT} is used by another program. Close it and start City AI again.")

    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)
    import uvicorn
    from app.main import app  # noqa: E402  (needs backend on sys.path)

    server = uvicorn.Server(uvicorn.Config(app, host=HOST, port=PORT, log_level="info", log_config=None))
    thread = threading.Thread(target=server.run, name="city-ai-backend", daemon=True)
    thread.start()
    for _ in range(120):
        if _city_backend_running():
            log.info("Backend is up")
            return server
        if not thread.is_alive():
            break
        time.sleep(0.25)
    raise RuntimeError("The backend did not start. See backend/data/desktop.log for details.")


def open_window() -> None:
    if webview is None:
        log.warning("pywebview not installed; falling back to Edge app mode")
        _open_edge_app_window()
        return
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True  # deliverable links open in your browser
    webview.create_window("City AI — Autonomous 3D Metropolis", APP_URL, width=1480, height=920,
                          min_size=(1024, 640), background_color="#070B14", text_select=True,
                          maximized=True)
    webview.start(icon=str(ICON) if ICON.is_file() else None, private_mode=False,
                  storage_path=str(BACKEND / "data" / "webview"))


def _open_edge_app_window() -> None:
    candidates = [
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("ProgramFiles", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    edge = next((str(c) for c in candidates if c.is_file()), None)
    if not edge:
        import webbrowser
        webbrowser.open(APP_URL)
        input("City AI is open in your browser. Press Enter here to stop it...")
        return
    profile = BACKEND / "data" / "edge-app-profile"
    # A dedicated profile makes Edge stay attached to this process, so closing the window ends the app.
    subprocess.run([edge, f"--app={APP_URL}", f"--user-data-dir={profile}", "--window-size=1480,920"])


def main() -> int:
    parser = argparse.ArgumentParser(description="City AI desktop app")
    parser.add_argument("--rebuild", action="store_true", help="rebuild the 3D city UI before starting")
    args = parser.parse_args()
    try:
        ensure_ollama()
        ensure_frontend(args.rebuild)
        server = start_backend()
    except Exception as ex:
        log.exception("Startup failed")
        _message_box(f"City AI could not start:\n\n{ex}")
        return 1
    try:
        try:
            open_window()
        except Exception:
            log.exception("Native window failed; falling back to Edge app mode")
            _open_edge_app_window()
    finally:
        if server is not None:
            log.info("Window closed; stopping backend")
            server.should_exit = True
            time.sleep(1.0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
