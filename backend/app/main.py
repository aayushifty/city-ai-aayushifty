"""FORGE AI FastAPI Application Entrypoint."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.config import config
from app.api.routes_projects import router as projects_router
from app.api.routes_tasks import router as tasks_router
from app.api.routes_misc import memory_router, approval_router, budget_router, ws_router
from app.api.routes_agents import router as agents_router

config.ensure_directories()


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_directories()
    yield

app = FastAPI(
    title="city_ai_aayushifty — Local-First Autonomous AI Metropolis",
    description="Local-first AI-agent operating system presented as an explorable 3D city with Ollama inference.",
    version="2.1.0",
    lifespan=lifespan
)

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]"}


@app.middleware("http")
async def local_only_guard(request: Request, call_next):
    """The backend can act on this computer, so only the local UI may call it.

    Rejects requests whose Host is not loopback (DNS rebinding) and state-changing requests sent from
    another website's origin (drive-by requests from pages open in your browser).
    """
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].lower()
    if host and host not in _LOOPBACK_HOSTS:
        return JSONResponse({"detail": "Forbidden host"}, status_code=403)
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in config.ALLOWED_ORIGINS:
        return JSONResponse({"detail": "Forbidden origin"}, status_code=403)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(memory_router)
app.include_router(approval_router)
app.include_router(budget_router)
app.include_router(ws_router)

# Direct links for generated presentations, websites and apps, e.g. http://127.0.0.1:8000/deliverables/apps/<name>/
app.mount("/deliverables", StaticFiles(directory=str(config.DELIVERABLES_DIR), html=True), name="deliverables")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "FORGE AI Platform",
        "project": "city_ai_aayushifty",
        "version": "2.1.0"
    }
