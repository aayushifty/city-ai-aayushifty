import asyncio
import heapq
import itertools
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, List, Optional, Any
from app.config import config, FREE_MODEL_CATALOG
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse
from app.providers.mock_provider import MockModelProvider
from app.providers.openai_provider import OpenAIModelProvider, GroqModelProvider, OpenRouterModelProvider
from app.providers.gemini_provider import GeminiModelProvider
from app.providers.ollama_provider import OllamaModelProvider
from app.providers.freellm_provider import FreeLLMModelProvider

logger = logging.getLogger("city_ai.model_router")

class PriorityGate:
    """A one-slot (or n-slot) lock whose waiters are served by priority, then arrival order.
    Interactive requests (a citizen answering you) use priority 0 and go ahead of queued background work
    (priority 1); a running generation is never interrupted."""

    def __init__(self, slots: int = 1):
        self._free = slots
        self._waiters: List[Any] = []
        self._seq = itertools.count()

    async def acquire(self, priority: int) -> None:
        if self._free > 0 and not self._waiters:
            self._free -= 1
            return
        fut = asyncio.get_running_loop().create_future()
        heapq.heappush(self._waiters, (priority, next(self._seq), fut))
        try:
            await fut
        except asyncio.CancelledError:
            if fut.done() and not fut.cancelled():
                self.release()          # the slot was handed to us just as we were cancelled
            raise

    def release(self) -> None:
        while self._waiters:
            _, _, fut = heapq.heappop(self._waiters)
            if not fut.done():
                fut.set_result(None)
                return
        self._free += 1

    @asynccontextmanager
    async def hold(self, priority: int = 1):
        await self.acquire(priority)
        try:
            yield
        finally:
            self.release()


class ModelRouter:
    """Routes inference requests across local and free cloud providers with fallback and concurrency control."""

    def __init__(self):
        self._providers: Dict[str, ModelProviderAdapter] = {
            "freellm": FreeLLMModelProvider(),
            "ollama": OllamaModelProvider(),
            "groq": GroqModelProvider(),
            "openrouter": OpenRouterModelProvider(),
            "gemini": GeminiModelProvider(),
            "openai": OpenAIModelProvider(),
            "mock": MockModelProvider(),
        }
        # The FreeLLM gateway leads when it is reachable; the local GPU is the safety net.
        self.fallback_chain = ["freellm", "ollama", "groq", "openrouter", "gemini", "openai", "mock"]
        # Local GPU work is serialized (one generation at a time, interactive first); cloud providers get
        # a little parallelism.
        self._semaphores: Dict[str, PriorityGate] = {
            "ollama": PriorityGate(1),
            "freellm": PriorityGate(2),     # free upstreams rate-limit bursts: two requests at a time
        }
        self._waiting: Dict[str, int] = {}

    def register_provider(self, name: str, provider: ModelProviderAdapter) -> None:
        self._providers[name] = provider

    def get_provider(self, name: str) -> Optional[ModelProviderAdapter]:
        return self._providers.get(name)

    def _sem(self, provider_name: str) -> PriorityGate:
        if provider_name not in self._semaphores:
            self._semaphores[provider_name] = PriorityGate(3)
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

        freellm_p: FreeLLMModelProvider = self._providers["freellm"]  # type: ignore
        freellm_models = await freellm_p.list_models()
        status = freellm_p.status()
        tested = status.get("coding_chain", []) + status.get("general_chain", [])
        for model_id in sorted(freellm_models, key=lambda m: (m not in tested, not freellm_p.is_ready(m), m.lower())):
            ready = freellm_p.is_ready(model_id)
            catalog.append({"provider": "freellm", "model": model_id, "label": model_id,
                            "strength": ("tested, recommended" if model_id in tested else
                                         "available" if ready else "needs a provider key in the gateway"),
                            "size_gb": 0, "installed": True, "ready": ready})

        return {
            "freellm": freellm_p.status(),
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
        preferred_provider: Optional[str] = None,
        interactive: bool = False,
        fallback_models: Optional[Dict[str, str]] = None,
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
                # a fallback uses the citizen's own model for that provider when it has one
                req = request.model_copy(update={"model_name": (fallback_models or {}).get(provider_name)
                                                 or config.PROVIDER_DEFAULT_MODELS.get(provider_name)})

            self._waiting[provider_name] = self._waiting.get(provider_name, 0) + 1
            acquired = False
            try:
                async with self._sem(provider_name).hold(0 if interactive else 1):
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
        preferred_provider: Optional[str] = None,
        interactive: bool = True,
        fallback_models: Optional[Dict[str, str]] = None,
    ) -> AsyncGenerator[str, None]:
        """Streams token by token from the first provider down the chain that can stream. A provider that fails
        before yielding anything hands over to the next; one that fails mid-reply ends the stream there."""
        candidates = []
        if preferred_provider and preferred_provider in self._providers:
            candidates.append(preferred_provider)
        for p in self.fallback_chain:
            if p not in candidates and p in self._providers and p != "mock":
                candidates.append(p)

        for provider_name in candidates:
            provider = self._providers[provider_name]
            if not hasattr(provider, "generate_stream"):
                continue
            try:
                if not await provider.is_available():
                    continue
            except Exception:
                continue
            req = request
            if preferred_provider and provider_name != preferred_provider:
                req = request.model_copy(update={"model_name": (fallback_models or {}).get(provider_name)
                                                 or config.PROVIDER_DEFAULT_MODELS.get(provider_name)})
            started = False
            self._waiting[provider_name] = self._waiting.get(provider_name, 0) + 1
            acquired = False
            try:
                async with self._sem(provider_name).hold(0 if interactive else 1):
                    acquired = True
                    self._waiting[provider_name] -= 1
                    async for token in provider.generate_stream(req):  # type: ignore[attr-defined]
                        started = True
                        yield token
                return
            except Exception as e:
                if started:
                    logger.warning(f"Stream from {provider_name} broke mid-reply: {e}")
                    return
                logger.warning(f"Streaming failed on {provider_name}: {e}. Attempting next fallback.")
            finally:
                if not acquired:
                    self._waiting[provider_name] -= 1

        resp = await self.route_completion(request, preferred_provider, interactive, fallback_models)
        yield resp.content

model_router = ModelRouter()
