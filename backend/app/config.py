"""FORGE AI System Configuration & Defaults."""

import os
from pathlib import Path
from pydantic import BaseModel, Field


def _load_dotenv() -> None:
    """Loads KEY=VALUE pairs from backend/.env into the environment (without overriding real env vars)."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def read_env_value(key: str):
    """Reads one value from the real environment or, if missing there, straight from backend/.env (so a key added
    while the app is running is picked up without a restart)."""
    value = os.getenv(key)
    if value:
        return value
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            k, sep, v = line.strip().partition("=")
            if sep and k.strip() == key and not line.strip().startswith("#"):
                return v.strip().strip('"').strip("'") or None
    return None


# Free model catalog shown in the UI. Local models run on your GPU through Ollama with no account;
# cloud entries use free-tier API keys (set GROQ_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY in backend/.env).
FREE_MODEL_CATALOG: list[dict] = [
    {"provider": "ollama", "model": "qwen3:4b-instruct", "label": "Qwen3 4B Instruct", "strength": "Best local tool-use / agent reasoning at small size", "size_gb": 2.5},
    {"provider": "ollama", "model": "llama3.2:latest", "label": "Llama 3.2 3B", "strength": "Fast conversation", "size_gb": 2.0},
    {"provider": "ollama", "model": "gemma3:4b", "label": "Gemma 3 4B", "strength": "Writing, summaries, presentation copy", "size_gb": 3.3},
    {"provider": "ollama", "model": "qwen2.5-coder:7b", "label": "Qwen2.5 Coder 7B", "strength": "Code generation (websites, apps, scripts)", "size_gb": 4.7},
    {"provider": "ollama", "model": "qwen3:8b", "label": "Qwen3 8B", "strength": "Stronger reasoning and planning", "size_gb": 5.2},
    {"provider": "ollama", "model": "deepseek-r1:8b", "label": "DeepSeek R1 8B", "strength": "Step-by-step reasoning", "size_gb": 5.2},
    {"provider": "ollama", "model": "llama3.1:8b", "label": "Llama 3.1 8B", "strength": "General purpose, larger context", "size_gb": 4.9},
    {"provider": "groq", "model": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B (Groq free tier)", "strength": "Very fast 70B cloud model", "size_gb": 0},
    {"provider": "groq", "model": "openai/gpt-oss-120b", "label": "GPT-OSS 120B (Groq free tier)", "strength": "Large open-weight reasoning model", "size_gb": 0},
    {"provider": "openrouter", "model": "deepseek/deepseek-chat-v3-0324:free", "label": "DeepSeek V3 (OpenRouter free)", "strength": "Strong coding and agents", "size_gb": 0},
    {"provider": "openrouter", "model": "qwen/qwen3-coder:free", "label": "Qwen3 Coder (OpenRouter free)", "strength": "Agentic coding", "size_gb": 0},
    {"provider": "gemini", "model": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (free tier)", "strength": "Long context, fast", "size_gb": 0},
]


class ForgeConfig(BaseModel):
    # Base paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    WORKSPACES_DIR: Path = DATA_DIR / "workspaces"
    DELIVERABLES_DIR: Path = DATA_DIR / "deliverables"
    DB_PATH: Path = DATA_DIR / "forge.db"

    # Server configuration. The backend controls this computer, so it only listens on loopback.
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = Field(default_factory=lambda: os.getenv("FORGE_DEBUG", "0") == "1")
    PUBLIC_BASE_URL: str = Field(default_factory=lambda: os.getenv("FORGE_PUBLIC_URL", "http://127.0.0.1:8000"))
    ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8000", "http://127.0.0.1:8000",
    ])

    # Security policies (sandboxed verification runner only — the agents' host tools are unrestricted
    # except for the catastrophic commands in SecurityEngine.CATASTROPHIC_PATTERNS)
    DISALLOWED_COMMANDS: list[str] = Field(default_factory=lambda: [
        "rmdir /s /q c:\\", "format", "del /f /s /q c:\\", "shutdown",
        "drop database", "mkfs", "dd if=", ":(){ :|:& };:"
    ])
    ALLOWED_COMMAND_PREFIXES: list[str] = Field(default_factory=lambda: [
        "python", "pytest", "ruff", "node", "npm", "git", "echo", "cat", "dir", "type", "mkdir", "touch", "ls", "pip"
    ])
    MAX_COMMAND_TIMEOUT_SECONDS: int = 120

    # Model defaults
    DEFAULT_PROVIDER: str = Field(default_factory=lambda: os.getenv("FORGE_PROVIDER", "ollama"))
    OPENAI_API_KEY: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    GEMINI_API_KEY: str | None = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY"))
    GROQ_API_KEY: str | None = Field(default_factory=lambda: os.getenv("GROQ_API_KEY"))
    OPENROUTER_API_KEY: str | None = Field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY"))
    OLLAMA_BASE_URL: str = Field(default_factory=lambda: os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"))
    OLLAMA_KEEP_ALIVE: str = "30m"
    OLLAMA_NUM_CTX: int = 8192
    DEFAULT_OLLAMA_MODEL: str = "qwen3:4b-instruct"
    PROVIDER_DEFAULT_MODELS: dict[str, str] = Field(default_factory=lambda: {
        "freellm": "",              # empty: the gateway's best listed model is used
        "ollama": "qwen3:4b-instruct",
        "groq": "llama-3.3-70b-versatile",
        "openrouter": "deepseek/deepseek-chat-v3-0324:free",
        "gemini": "gemini-2.5-flash",
        "openai": "gpt-4o-mini",
    })
    # Per-role local model. Missing models fall back to the best installed one automatically.
    ROLE_MODEL_PREFERENCES: dict[str, str] = Field(default_factory=lambda: {
        "coordinator": "qwen3:4b-instruct",
        "analyst": "gemma3:4b",
        "architect": "qwen3:4b-instruct",
        "engineer": "qwen2.5-coder:7b",
        "qa": "qwen3:4b-instruct",
        "diagnostic": "qwen3:4b-instruct",
        "security": "qwen3:4b-instruct",
        "devops": "qwen3:4b-instruct",
        "constructor": "gemma3:4b",
        "doctor": "gemma3:4b",
        "designer": "qwen3:4b-instruct",
        "webdev": "qwen2.5-coder:7b",
        "researcher": "qwen3:4b-instruct",
        "data": "qwen3:4b-instruct",
        "operator": "qwen3:4b-instruct",
    })

    # Agent loop
    AGENT_MAX_STEPS: int = 14
    AGENT_MAX_REPAIR_ATTEMPTS: int = 3
    AGENT_HISTORY_TURNS: int = 6

    # Execution & budget defaults
    MAX_TASK_RETRIES: int = 3
    DEFAULT_PROJECT_BUDGET_USD: float = 25.0
    DEFAULT_TASK_TIMEOUT_SECONDS: int = 300
    MAX_CONCURRENT_TASKS: int = 2

    def ensure_directories(self) -> None:
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
        self.DELIVERABLES_DIR.mkdir(parents=True, exist_ok=True)

config = ForgeConfig()
