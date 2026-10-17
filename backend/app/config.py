"""FORGE AI System Configuration & Defaults."""

import os
from pathlib import Path
from pydantic import BaseModel, Field

class ForgeConfig(BaseModel):
    # Base paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    WORKSPACES_DIR: Path = DATA_DIR / "workspaces"
    DB_PATH: Path = DATA_DIR / "forge.db"
    
    # Server configuration
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    
    # Security policies
    DISALLOWED_COMMANDS: list[str] = Field(default_factory=lambda: [
        "rmdir /s /q c:\\", "format", "del /f /s /q c:\\", "shutdown",
        "drop database", "mkfs", "dd if=", ":(){ :|:& };:"
    ])
    ALLOWED_COMMAND_PREFIXES: list[str] = Field(default_factory=lambda: [
        "python", "pytest", "ruff", "node", "npm", "git", "echo", "cat", "dir", "type", "mkdir", "touch", "ls", "pip"
    ])
    MAX_COMMAND_TIMEOUT_SECONDS: int = 120
    
    # Model defaults
    DEFAULT_PROVIDER: str = "ollama"
    OPENAI_API_KEY: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    GEMINI_API_KEY: str | None = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY"))
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_OLLAMA_MODEL: str = "llama3.2:latest"
    ROLE_MODEL_PREFERENCES: dict[str, str] = Field(default_factory=lambda: {
        "coordinator": "llama3.2:latest",
        "analyst": "llama3.2:latest",
        "architect": "llama3.2:latest",
        "engineer": "llama3.2:latest",
        "qa": "llama3.2:latest",
        "diagnostic": "llama3.2:latest",
        "security": "llama3.2:latest",
        "devops": "llama3.2:latest",
        "constructor": "llama3.2:latest",
        "doctor": "llama3.2:latest"
    })
    
    # Execution & budget defaults
    MAX_TASK_RETRIES: int = 3
    DEFAULT_PROJECT_BUDGET_USD: float = 25.0
    DEFAULT_TASK_TIMEOUT_SECONDS: int = 300
    MAX_CONCURRENT_TASKS: int = 2

    def ensure_directories(self) -> None:
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)

config = ForgeConfig()
