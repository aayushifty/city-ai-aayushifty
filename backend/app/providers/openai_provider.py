"""FORGE AI OpenAI & OpenAI-Compatible Provider Adapters (OpenAI, Groq, OpenRouter)."""

import json
import os
import time
from typing import Optional
import httpx
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.core.security import SecurityEngine

class OpenAIModelProvider(ModelProviderAdapter):
    """Adapter for OpenAI or any OpenAI-compatible chat completions endpoint."""

    name = "openai"
    default_model = "gpt-4o-mini"
    api_key_env = "OPENAI_API_KEY"
    default_base_url = "https://api.openai.com/v1"
    price_in_per_m = 0.15
    price_out_per_m = 0.60
    supports_json_mode = True
    request_timeout = 120.0

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, default_model: Optional[str] = None):
        self.api_key = api_key or os.getenv(self.api_key_env)
        self.base_url = (base_url or self.default_base_url).rstrip("/")
        if default_model:
            self.default_model = default_model

    @property
    def provider_name(self) -> str:
        return self.name

    async def is_available(self) -> bool:
        return bool(self.api_key)

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int, model_name: str) -> float:
        input_cost = (prompt_tokens / 1_000_000.0) * self.price_in_per_m
        output_cost = (completion_tokens / 1_000_000.0) * self.price_out_per_m
        return round(input_cost + output_cost, 6)

    def _extra_headers(self) -> dict:
        return {}

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout)

    def _model_for(self, request: ModelCompletionRequest) -> str:
        return request.model_name or self.default_model

    async def generate(self, request: ModelCompletionRequest) -> ModelCompletionResponse:
        if not self.api_key:
            raise ValueError(f"{self.api_key_env} is not configured")

        start = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            **self._extra_headers(),
        }

        payload = {
            "model": self._model_for(request),
            "messages": request.chat_messages(),
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }
        if request.json_mode and self.supports_json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with self._client(request.timeout_s or self.request_timeout) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            if resp.status_code == 400 and "response_format" in payload:
                # Some hosted models reject JSON mode; retry without it and parse leniently.
                payload.pop("response_format")
                resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]
        content = choice["message"].get("content") or ""
        usage = data.get("usage", {}) or {}
        p_tokens = usage.get("prompt_tokens", 0)
        c_tokens = usage.get("completion_tokens", 0)
        cost = self.estimate_cost(p_tokens, c_tokens, payload["model"])
        latency = (time.perf_counter() - start) * 1000.0

        return ModelCompletionResponse(
            content=SecurityEngine.redact_secrets(content),
            model_name=payload["model"],
            provider_name=self.provider_name,
            prompt_tokens=p_tokens,
            completion_tokens=c_tokens,
            estimated_cost_usd=cost,
            latency_ms=latency,
            is_fallback=False,
            raw_metadata={"id": data.get("id"), "finish_reason": choice.get("finish_reason")}
        )

    async def generate_stream(self, request: ModelCompletionRequest):
        """Yields the reply token by token (OpenAI server-sent events)."""
        if not self.api_key:
            raise ValueError(f"{self.api_key_env} is not configured")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", **self._extra_headers()}
        payload = {"model": self._model_for(request), "messages": request.chat_messages(),
                   "temperature": request.temperature, "max_tokens": request.max_tokens, "stream": True}
        async with self._client(request.timeout_s or self.request_timeout) as client:
            async with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        delta = (json.loads(data).get("choices") or [{}])[0].get("delta", {}).get("content")
                    except (ValueError, AttributeError, IndexError):
                        continue
                    if delta:
                        yield SecurityEngine.redact_secrets(delta)


class GroqModelProvider(OpenAIModelProvider):
    """Groq free tier: very fast hosted open-weight models (get a key at console.groq.com)."""

    name = "groq"
    default_model = "llama-3.3-70b-versatile"
    api_key_env = "GROQ_API_KEY"
    default_base_url = "https://api.groq.com/openai/v1"
    price_in_per_m = 0.0
    price_out_per_m = 0.0


class OpenRouterModelProvider(OpenAIModelProvider):
    """OpenRouter: models whose id ends in ':free' cost nothing (get a key at openrouter.ai)."""

    name = "openrouter"
    default_model = "deepseek/deepseek-chat-v3-0324:free"
    api_key_env = "OPENROUTER_API_KEY"
    default_base_url = "https://openrouter.ai/api/v1"
    price_in_per_m = 0.0
    price_out_per_m = 0.0
    supports_json_mode = False

    def _extra_headers(self) -> dict:
        return {"HTTP-Referer": "http://127.0.0.1:5173", "X-Title": "city_ai_aayushifty"}
