import asyncio
import logging
from typing import AsyncGenerator, Dict, List, Optional, Any
from app.config import config, FREE_MODEL_CATALOG
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.providers.mock_provider import MockModelProvider
from app.providers.openai_provider import OpenAIModelProvider, GroqModelProvider, OpenRouterModelProvider
from app.providers.gemini_provider import GeminiModelProvider
from app.providers.ollama_provider import OllamaModelProvider

logger = logging.getLogger("city_ai.model_router")

class ModelRouter:
    """Routes inference requests across local and free cloud providers with fallback and concurrency control."""

    def __init__(self):
        self._providers: Dict[str, ModelProviderAdapter] = {
            "ollama": OllamaModelProvider(),
            "groq": GroqModelProvider(),
            "openrouter": OpenRouterModelProvider(),
            "gemini": GeminiModelProvider(),
            "openai": OpenAIModelProvider(),
            "mock": MockModelProvider(),
        }
        self.fallback_chain = ["ollama", "groq", "openrouter", "gemini", "openai", "mock"]
        # Local GPU work is serialized per provider; cloud providers get a little parallelism.
        self._semaphores: Dict[str, asyncio.Semaphore] = {
            "ollama": asyncio.Semaphore(1),
        }
        self._waiting: Dict[str, int] = {}

    def register_provider(self, name: str, provider: ModelProviderAdapter) -> None:
        self._providers[name] = provider

    def get_provider(self, name: str) -> Optional[ModelProviderAdapter]:
        return self._providers.get(name)

    def _sem(self, provider_name: str) -> asyncio.Semaphore:
        if provider_name not in self._semaphores:
            self._semaphores[provider_name] = asyncio.Semaphore(3)
        return self._semaphores[provider_name]

    def queue_depth(self, provider_name: str = "ollama") -> int:
        return self._waiting.get(provider_name, 0)

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
        """Snapshot of providers, installed local models, and the free model catalog."""
        ollama_p: OllamaModelProvider = self._providers["ollama"]  # type: ignore
        ollama_online = await ollama_p.is_available()
        installed_models = await ollama_p.list_models() if ollama_online else []
        installed_names = {m["name"] for m in installed_models}

        available_providers = await self.get_available_providers()
        catalog = []
        for entry in FREE_MODEL_CATALOG:
            item = dict(entry)
            if entry["provider"] == "ollama":
                item["installed"] = any(n == entry["model"] or n.startswith(entry["model"] + ":") for n in installed_names)
                item["ready"] = item["installed"] and ollama_online
            else:
                item["installed"] = True
                item["ready"] = entry["provider"] in available_providers
            catalog.append(item)

        return {
            "ollama_online": ollama_online,
            "installed_models": installed_models,
            "available_providers": available_providers,
            "active_default_provider": config.DEFAULT_PROVIDER if config.DEFAULT_PROVIDER in available_providers else ("ollama" if ollama_online else "mock"),
            "concurrency_limit": 1,
            "ollama_queue_depth": self.queue_depth("ollama"),
            "free_model_catalog": catalog,
        }

    async def route_completion(
        self,
        request: ModelCompletionRequest,
        preferred_provider: Optional[str] = None
    ) -> ModelCompletionResponse:
        """Tries the preferred provider, then falls back down the chain. Each provider gets its own default
        model when it isn't the one the request's model name was chosen for."""
        candidates = []
        if preferred_provider and preferred_provider in self._providers:
            candidates.append(preferred_provider)
        for p in self.fallback_chain:
            if p not in candidates and p in self._providers:
                candidates.append(p)

        last_error = None
        for provider_name in candidates:
            provider = self._providers[provider_name]
            try:
                if not await provider.is_available():
                    continue
            except Exception:
                continue

            req = request
            if preferred_provider and provider_name != preferred_provider:
                req = request.model_copy(update={"model_name": config.PROVIDER_DEFAULT_MODELS.get(provider_name)})

            self._waiting[provider_name] = self._waiting.get(provider_name, 0) + 1
            acquired = False
            try:
                async with self._sem(provider_name):
                    acquired = True
                    self._waiting[provider_name] -= 1
                    response = await provider.generate(req)
            except Exception as e:
                logger.warning(f"Provider {provider_name} failed: {e}. Attempting next fallback.")
                last_error = e
                continue
            finally:
                if not acquired:
                    self._waiting[provider_name] -= 1
            if preferred_provider and provider_name != preferred_provider:
                response.is_fallback = True
            return response

        logger.warning(f"All configured providers failed. Using deterministic Mock provider. Error: {last_error}")
        resp = await self._providers["mock"].generate(request)
        resp.is_fallback = True
        return resp

    async def route_completion_stream(
        self,
        request: ModelCompletionRequest,
        preferred_provider: Optional[str] = "ollama"
    ) -> AsyncGenerator[str, None]:
        """Streams completion from Ollama if available, otherwise completes and yields content."""
        ollama_p = self._providers.get("ollama")
        if preferred_provider == "ollama" and ollama_p and await ollama_p.is_available() and hasattr(ollama_p, "generate_stream"):
            async with self._sem("ollama"):
                try:
                    async for token in ollama_p.generate_stream(request):  # type: ignore
                        yield token
                    return
                except Exception as e:
                    logger.warning(f"Streaming failed on Ollama: {e}, falling back to non-streamed")

        resp = await self.route_completion(request, preferred_provider)
        yield resp.content

model_router = ModelRouter()
