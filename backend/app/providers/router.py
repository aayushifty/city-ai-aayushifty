import asyncio
import logging
from typing import AsyncGenerator, Dict, List, Optional, Any
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.providers.mock_provider import MockModelProvider
from app.providers.openai_provider import OpenAIModelProvider
from app.providers.gemini_provider import GeminiModelProvider
from app.providers.ollama_provider import OllamaModelProvider

logger = logging.getLogger("city_ai.model_router")

class ModelRouter:
    """Intelligently routes inference requests across model providers with local Ollama priority and concurrency control."""

    def __init__(self):
        self._providers: Dict[str, ModelProviderAdapter] = {
            "ollama": OllamaModelProvider(),
            "openai": OpenAIModelProvider(),
            "gemini": GeminiModelProvider(),
            "mock": MockModelProvider(),
        }
        self.fallback_chain = ["ollama", "openai", "gemini", "mock"]
        self._concurrency_sem = asyncio.Semaphore(2)

    def register_provider(self, name: str, provider: ModelProviderAdapter) -> None:
        self._providers[name] = provider

    def get_provider(self, name: str) -> Optional[ModelProviderAdapter]:
        return self._providers.get(name)

    async def get_available_providers(self) -> List[str]:
        available = []
        for name, provider in self._providers.items():
            try:
                if await provider.is_available():
                    available.append(name)
            except Exception:
                pass
        return available

    async def get_registry_snapshot(self) -> Dict[str, Any]:
        """Provides snapshot of local and external AI model providers and installed models."""
        ollama_p: OllamaModelProvider = self._providers["ollama"]  # type: ignore
        ollama_online = await ollama_p.is_available()
        installed_models = await ollama_p.list_models() if ollama_online else []

        available_providers = await self.get_available_providers()
        return {
            "ollama_online": ollama_online,
            "installed_models": installed_models,
            "available_providers": available_providers,
            "active_default_provider": "ollama" if ollama_online else "mock",
            "concurrency_limit": 2
        }

    async def route_completion(
        self,
        request: ModelCompletionRequest,
        preferred_provider: Optional[str] = None
    ) -> ModelCompletionResponse:
        """Attempts generation with preferred provider, falling back down the resilience chain under concurrency limits."""
        candidates = []
        if preferred_provider and preferred_provider in self._providers:
            candidates.append(preferred_provider)
            
        for p in self.fallback_chain:
            if p not in candidates and p in self._providers:
                candidates.append(p)

        last_error = None
        async with self._concurrency_sem:
            for i, provider_name in enumerate(candidates):
                provider = self._providers[provider_name]
                try:
                    if not await provider.is_available():
                        continue
                        
                    response = await provider.generate(request)
                    if preferred_provider and provider_name != preferred_provider:
                        response.is_fallback = True
                    return response
                except Exception as e:
                    logger.warning(f"Provider {provider_name} failed: {e}. Attempting next fallback.")
                    last_error = e

            logger.warning(f"All configured providers failed. Falling back to deterministic Mock provider. Error: {last_error}")
            mock_provider = self._providers["mock"]
            resp = await mock_provider.generate(request)
            resp.is_fallback = True
            return resp

    async def route_completion_stream(
        self,
        request: ModelCompletionRequest,
        preferred_provider: Optional[str] = "ollama"
    ) -> AsyncGenerator[str, None]:
        """Streams completion from Ollama if available, otherwise completes and yields content."""
        ollama_p = self._providers.get("ollama")
        if ollama_p and await ollama_p.is_available() and hasattr(ollama_p, "generate_stream"):
            async with self._concurrency_sem:
                try:
                    async for token in ollama_p.generate_stream(request):  # type: ignore
                        yield token
                    return
                except Exception as e:
                    logger.warning(f"Streaming failed on Ollama: {e}, falling back to non-streamed")

        # Fallback to standard completion
        resp = await self.route_completion(request, preferred_provider)
        yield resp.content

model_router = ModelRouter()
