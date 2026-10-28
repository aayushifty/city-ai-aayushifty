"""FORGE AI Local Ollama Provider Adapter with Dynamic Model Detection & Streaming."""

import asyncio
import json
import logging
import re
import time
from typing import AsyncGenerator, Dict, List, Optional, Any
import httpx
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.core.security import SecurityEngine
from app.config import config

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)

logger = logging.getLogger("city_ai.ollama_provider")

class OllamaModelProvider(ModelProviderAdapter):
    """Adapter for locally hosted Ollama instances with automatic model discovery and streaming."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or config.OLLAMA_BASE_URL).rstrip("/")
        self._cached_models: List[Dict[str, Any]] = []
        self._last_models_fetch: float = 0.0
        self._available_until: float = 0.0

    @property
    def provider_name(self) -> str:
        return "ollama"

    def _ensure_daemon_running(self) -> None:
        """Attempts to start local Ollama background service if it is offline."""
        import os
        import subprocess
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        ollama_bin = os.path.join(local_app_data, "Programs", "Ollama", "ollama.exe")
        target_cmd = ollama_bin if os.path.exists(ollama_bin) else "ollama"
        try:
            subprocess.Popen(
                [target_cmd, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
            )
            logger.info("Launched local Ollama inference daemon in background.")
        except Exception as e:
            logger.warning(f"Could not auto-start Ollama daemon: {e}")

    async def is_available(self) -> bool:
        # Cache a positive probe briefly so every completion doesn't pay an extra round trip.
        if time.time() < self._available_until:
            return True
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    res = await client.get(f"{self.base_url}/api/tags")
                    if res.status_code == 200:
                        self._available_until = time.time() + 10.0
                        return True
            except Exception:
                if attempt == 0:
                    self._ensure_daemon_running()
                    await asyncio.sleep(1.5)
        return False

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int, model_name: str) -> float:
        return 0.0

    async def list_models(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Queries local Ollama instance for all installed models and their metadata."""
        now = time.time()
        if not force_refresh and self._cached_models and (now - self._last_models_fetch < 15.0):
            return self._cached_models

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = []
                    for m in data.get("models", []):
                        models.append({
                            "name": m.get("name", ""),
                            "model": m.get("model", ""),
                            "size_bytes": m.get("size", 0),
                            "modified_at": m.get("modified_at", ""),
                            "details": m.get("details", {}),
                            "is_online": True
                        })
                    self._cached_models = models
                    self._last_models_fetch = now
                    return models
        except Exception as e:
            logger.warning(f"Failed to query Ollama models: {e}")
            
        return self._cached_models

    async def resolve_model(self, requested_model: Optional[str] = None) -> str:
        """Resolves the best available local model, auto-detecting installed models."""
        installed = await self.list_models()
        installed_names = [m["name"] for m in installed]

        if requested_model and requested_model in installed_names:
            return requested_model

        # Partial match (e.g. "llama3.2" matching "llama3.2:latest")
        if requested_model:
            for name in installed_names:
                if requested_model in name or name.startswith(requested_model):
                    return name

        # Preference hierarchy among well-known coding/reasoning models
        preferences = [
            "qwen3:4b-instruct",
            "llama3.2:latest",
            "gemma3:4b",
            "qwen2.5-coder",
            "llama3",
            "mistral"
        ]
        for pref in preferences:
            for name in installed_names:
                if pref in name:
                    return name

        # Any installed model that isn't purely embedding
        for name in installed_names:
            if "embed" not in name.lower():
                return name

        if installed_names:
            return installed_names[0]

        return requested_model or "llama3.2:latest"

    def _chat_payload(self, request: ModelCompletionRequest, model: str, stream: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": request.chat_messages(),
            "stream": stream,
            "keep_alive": config.OLLAMA_KEEP_ALIVE,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
                "num_ctx": config.OLLAMA_NUM_CTX,
            },
        }
        if request.json_mode:
            payload["format"] = "json"
        if request.stop_sequences:
            payload["options"]["stop"] = request.stop_sequences
        return payload

    async def generate(self, request: ModelCompletionRequest) -> ModelCompletionResponse:
        start = time.perf_counter()
        target_model = await self.resolve_model(request.model_name)
        payload = self._chat_payload(request, target_model, stream=False)

        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()

        content = _THINK_RE.sub("", data.get("message", {}).get("content", "")).strip()
        p_tokens = data.get("prompt_eval_count", 0)
        c_tokens = data.get("eval_count", len(content.split()))
        latency = (time.perf_counter() - start) * 1000.0

        return ModelCompletionResponse(
            content=SecurityEngine.redact_secrets(content),
            model_name=target_model,
            provider_name=self.provider_name,
            prompt_tokens=p_tokens,
            completion_tokens=c_tokens,
            estimated_cost_usd=0.0,
            latency_ms=latency,
            is_fallback=False,
            raw_metadata={"finish_reason": data.get("done_reason")}
        )

    async def generate_stream(self, request: ModelCompletionRequest) -> AsyncGenerator[str, None]:
        """Streams generated tokens directly from local Ollama runtime."""
        target_model = await self.resolve_model(request.model_name)
        payload = self._chat_payload(request, target_model, stream=True)

        async with httpx.AsyncClient(timeout=600.0) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except Exception:
                        continue
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield SecurityEngine.redact_secrets(token)
                    if chunk.get("done", False):
                        break

    async def pull_model(self, model: str) -> Dict[str, Any]:
        """Downloads a model into the local Ollama library (blocking until finished)."""
        async with httpx.AsyncClient(timeout=None) as client:
            resp = await client.post(f"{self.base_url}/api/pull", json={"model": model, "stream": False})
            resp.raise_for_status()
            self._last_models_fetch = 0.0
            return resp.json()
