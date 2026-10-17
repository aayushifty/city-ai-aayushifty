"""FORGE AI FastAPI Application Entrypoint."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import config
from app.api.routes_projects import router as projects_router
from app.api.routes_tasks import router as tasks_router
from app.api.routes_misc import memory_router, approval_router, budget_router, ws_router
from app.api.routes_agents import router as agents_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_directories()
    yield

app = FastAPI(
    title="city_ai_aayushifty — Local-First Autonomous AI Metropolis",
    description="Local-first AI-agent operating system presented as an explorable 3D city with Ollama inference.",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "FORGE AI Platform",
        "project": "city_ai_aayushifty",
        "version": "2.0.0"
    }
