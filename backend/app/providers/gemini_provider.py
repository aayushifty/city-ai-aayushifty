"""FORGE AI Google Gemini Provider Adapter."""

import os
import time
from typing import Optional
import httpx
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.core.security import SecurityEngine

class GeminiModelProvider(ModelProviderAdapter):
    """Adapter for Google Gemini API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")

    @property
    def provider_name(self) -> str:
        return "gemini"

    async def is_available(self) -> bool:
        return bool(self.api_key)

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int, model_name: str) -> float:
        input_cost = (prompt_tokens / 1_000_000.0) * 0.35
        output_cost = (completion_tokens / 1_000_000.0) * 1.05
        return round(input_cost + output_cost, 6)

    async def generate(self, request: ModelCompletionRequest) -> ModelCompletionResponse:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        start = time.perf_counter()
        model = request.model_name or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        contents = []
        for m in (request.messages or [{"role": "user", "content": request.prompt}]):
            role = "model" if m.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens
            }
        }
        if request.system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": request.system_prompt}]}
        if request.json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers={"x-goog-api-key": self.api_key})
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned empty candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        content = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata", {})
        p_tokens = usage.get("promptTokenCount", 0)
        c_tokens = usage.get("candidatesTokenCount", 0)
        cost = self.estimate_cost(p_tokens, c_tokens, model)
        latency = (time.perf_counter() - start) * 1000.0

        return ModelCompletionResponse(
            content=SecurityEngine.redact_secrets(content),
            model_name=model,
            provider_name=self.provider_name,
            prompt_tokens=p_tokens,
            completion_tokens=c_tokens,
            estimated_cost_usd=cost,
            latency_ms=latency,
            is_fallback=False
        )
