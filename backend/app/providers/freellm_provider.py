"""FreeLLM gateway: a local OpenAI-compatible gateway (default http://localhost:3001/v1) that fronts many free
models. The key is read from FREELLM_API_KEY in backend/.env (never from chat, never committed; a key added while
the app runs is picked up on the next check); the base URL can be changed with FREELLM_BASE_URL.

The gateway lists far more models than your configured providers can serve, and free upstreams come and go
(rate limits, outages). So:
- only models the gateway marks available/ready are considered;
- the strongest of those are ranked and *tested* with a tiny request (re-tested every 15 minutes), and each role
  class (coding / general) keeps a short chain of models that really answered;
- a call that hits a rate limit or upstream error moves to the next model in the chain; only when the whole chain
  fails does the router fall back to the citizen's local Ollama model.
"""

import asyncio
import json
import os
import re
import time
from typing import Any, Dict, List, Optional

import httpx

from app.providers.openai_provider import OpenAIModelProvider

# Never picked automatically: not chat models, routers, guards and toy-sized / role-play models.
_NON_CHAT = re.compile(r"embed|whisper|tts|speech|audio|transcri|image|dall-?e|stable-?diff|flux|moderation|guard|safety|"
                       r"rerank|ocr|vision-only|robotics|-vl-|pythia|cerebras-gpt|prompt-guard|uncensored|heretic|-rp-|"
                       r"stheno|nymphaea|magnum|lotus|rocinante|impish|cydonia|skyfall|behemoth|safeword|eclipse|thea-rp",
                       re.IGNORECASE)
_ROUTERS = re.compile(r"^(auto|auto-route|free-router|fusion)$|-auto$", re.IGNORECASE)
# Strongest families first (substring match on the model id).
_GENERAL_RANK = ["gpt-5", "claude", "gemini-2.5-pro", "qwen3.5-397b", "nemotron-3-ultra", "deepseek-v4-pro", "deepseek-r1",
                 "deepseek-v3", "qwen3-235b", "qwen3-max", "kimi-k2", "glm-5", "gemini-3.5-flash", "gemini-3-flash",
                 "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gpt-oss-120b", "gpt-4.1", "gpt-4o",
                 "nemotron-3-super", "llama-4-maverick", "llama-3.3-70b", "dots3", "mistral-large", "mistral-small",
                 "qwen3.8-27b", "qwen3.6-27b", "gemma-4-31b", "gemini-2.5-flash", "qwen3", "llama-3.3", "mixtral"]
_CODE_RANK = ["qwen3-coder", "gpt-5", "claude", "qwen3.5-397b", "gemini-3.5-flash", "gemini-3-flash", "poolside-laguna-s",
              "deepseek-v4-pro", "deepseek-v3", "kimi-k2", "glm-5", "devstral", "codestral", "nemotron-3-ultra",
              "gpt-oss-120b", "north-mini-code", "qwen2.5-coder-32b", "gpt-4.1"] + _GENERAL_RANK
# Fast coders for bulk file writing and repairs: quick to answer, good at code. Huge reasoning models
# (nemotron-3-ultra, poolside, deepseek-r1, ...) are left out because one file can take them minutes.
_FAST_CODE_RANK = ["qwen3-coder", "gemini-3.5-flash", "gemini-3-flash", "gemini-3.6-flash", "gemini-3.7-flash",
                   "gemini-3.8-flash", "gpt-oss-120b", "deepseek-v3", "kimi-k2", "devstral", "codestral", "glm-5",
                   "gpt-4.1", "qwen2.5-coder-32b", "llama-3.3-70b"]
_SLOW = re.compile(r"nemotron-3-ultra|poolside|deepseek-r1|-thinking|reason", re.IGNORECASE)
RETRYABLE = {404, 408, 409, 425, 429, 500, 502, 503, 504, 529}
PROBE_TTL_S = 15 * 60
CHAIN_LEN = 5
BACKOFF_ROUNDS = 2
MAX_BACKOFF_S = 20.0


def rank_models(ids: List[str], coding: bool = False, fast: bool = False) -> List[str]:
    """Orders model ids from most to least preferred for a role (coding or general); unusable kinds are dropped.
    fast=True keeps only the quick coder families, in _FAST_CODE_RANK order."""
    order = _FAST_CODE_RANK if fast else _CODE_RANK if coding else _GENERAL_RANK
    chat = [m for m in ids if not _NON_CHAT.search(m)]
    if fast:
        chat = [m for m in chat if not _SLOW.search(m) and any(k in m.lower() for k in order)]

    def score(model_id: str) -> tuple:
        low = model_id.lower()
        rank = next((i for i, key in enumerate(order) if key in low), len(order))
        size = max((int(n) for n in re.findall(r"(\d{2,4})b\b", low)), default=0)
        small_variant = bool(re.search(r"lite|nano|mini|tiny|small|-\d(\.\d)?b", low))   # weaker sibling of a family
        return (bool(_ROUTERS.search(low)), rank, small_variant, -size, ":free" not in low, low)

    return sorted(chat, key=score)


class FreeLLMModelProvider(OpenAIModelProvider):
    """Local FreeLLM gateway (OpenAI-compatible) with tested model chains and failover."""

    name = "freellm"
    default_model = ""
    api_key_env = "FREELLM_API_KEY"
    default_base_url = "http://localhost:3001/v1"
    price_in_per_m = 0.0
    price_out_per_m = 0.0
    supports_json_mode = True
    request_timeout = 300.0          # whole files of a project are written through it
    _CACHE_S = 60.0

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 transport: Optional[httpx.AsyncBaseTransport] = None):
        super().__init__(api_key=api_key, base_url=base_url or os.getenv("FREELLM_BASE_URL") or self.default_base_url)
        self._transport = transport
        self._explicit_key = api_key is not None
        self._models: List[str] = []
        self._ready: List[str] = []
        self._checked_at = 0.0
        self._ok = False
        self._chains: Dict[Any, List[str]] = {}       # True = coding, False = general, "fast" = quick coders
        self._probed_at: Dict[Any, float] = {}
        self._probe_lock = asyncio.Lock()
        self.last_error: Optional[str] = None
        self.last_used: Optional[str] = None

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self._transport)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def refresh(self, force: bool = False) -> bool:
        """Re-reads /models (cached for a minute). Returns whether the gateway is usable."""
        if not force and time.monotonic() - self._checked_at < self._CACHE_S:
            return self._ok
        self._checked_at = time.monotonic()
        if not self.api_key and not self._explicit_key:
            from app.config import read_env_value
            self.api_key = read_env_value(self.api_key_env)    # added to backend/.env while running
        if not self.api_key:
            self._ok, self._models, self._ready = False, [], []
            self.last_error = f"{self.api_key_env} is not set in backend/.env"
            return False
        try:
            async with self._client(10.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers())
            if resp.status_code != 200:
                self._ok, self._models, self._ready = False, [], []
                self.last_error = f"gateway answered {resp.status_code}" + (" (check FREELLM_API_KEY)" if resp.status_code in (401, 403) else "")
                return False
            data: Any = resp.json()
            items = data.get("data", data) if isinstance(data, dict) else data
            models, ready = [], []
            for m in items or []:
                mid = str(m.get("id") if isinstance(m, dict) else m)
                if not mid:
                    continue
                models.append(mid)
                if not isinstance(m, dict) or (m.get("available") is not False
                                               and m.get("execution_status") in (None, "ready")):
                    ready.append(mid)
            self._models, self._ready = sorted(set(models)), sorted(set(ready))
            self._ok = bool(self._ready)
            self.last_error = None if self._ready else "the gateway lists no model your providers can serve (add provider keys in its dashboard)"
        except Exception as ex:  # daemon stopped, port closed, bad JSON ...
            self._ok, self._models, self._ready, self.last_error = False, [], [], f"gateway unreachable ({type(ex).__name__})"
        return self._ok

    async def is_available(self) -> bool:
        return await self.refresh()

    async def list_models(self) -> List[str]:
        await self.refresh()
        return list(self._models)

    def is_ready(self, model_id: str) -> bool:
        return model_id in self._ready

    async def _probe(self, model_id: str) -> bool:
        """Does this model really answer, and follow a JSON instruction?"""
        try:
            async with self._client(45.0) as client:
                resp = await client.post(f"{self.base_url}/chat/completions", headers=self._headers(), json={
                    "model": model_id, "max_tokens": 60, "temperature": 0,
                    "messages": [{"role": "user", "content": 'Reply with ONLY this JSON object: {"ok": true}'}]})
            if resp.status_code != 200:
                return False
            text = (resp.json()["choices"][0]["message"].get("content") or "").strip().strip("`").strip()
            text = text[4:].strip() if text.lower().startswith("json") else text
            return json.loads(text) == {"ok": True}
        except Exception:
            return False

    async def choose(self, coding: bool = False, force: bool = False) -> List[str]:
        """The tested chain of models for a role class (best first). Re-tested every 15 minutes."""
        if not await self.refresh():
            return []
        if not force and coding in self._chains and time.monotonic() - self._probed_at.get(coding, 0) < PROBE_TTL_S:
            return self._chains[coding]
        async with self._probe_lock:
            forced = os.getenv("FREELLM_MODEL")
            fast = coding == "fast"
            candidates = ([forced] if forced in self._ready and not fast else []) + [
                m for m in rank_models(self._ready, bool(coding), fast) if not _ROUTERS.search(m)][:10]
            results = await asyncio.gather(*(self._probe(m) for m in candidates))
            chain = [m for m, ok in zip(candidates, results) if ok][:CHAIN_LEN]
            if not chain and fast:      # no quick coder answered: use the normal coding chain
                self._probed_at[coding] = time.monotonic()
                self._chains[coding] = []
                return []
            if not chain:   # nothing passed the test: the gateway's own router is the last resort
                chain = [m for m in ("auto", "free-router") if m in self._ready][:1]
            self._chains[coding], self._probed_at[coding] = chain, time.monotonic()
            return chain

    async def fast_models(self) -> List[str]:
        """Tested quick coders for writing and repairing files (best first); empty when none answered."""
        return await self.choose("fast")   # type: ignore[arg-type]

    def best_model(self, coding: bool = False) -> Optional[str]:
        chain = self._chains.get(coding)
        if chain:
            return chain[0]
        ranked = rank_models(self._ready, coding)
        return ranked[0] if ranked else None

    def _model_for(self, request) -> str:
        model = request.model_name or ""
        if model and (not self._models or model in self._models):
            return model
        return self.best_model() or model

    def _failover(self, first: str) -> List[str]:
        """The models to try after `first`: its own chain (fast / coding / general), then the others."""
        if first in self._chains.get("fast", []):
            keys: List[Any] = ["fast", True, False]
        elif first in self._chains.get(True, []) and first not in self._chains.get(False, []):
            keys = [True, False]
        else:
            keys = [False, True]
        return [m for k in keys for m in self._chains.get(k, []) if m != first]

    async def generate(self, request):
        """Tries the requested model, then the rest of its tested chain, on rate limits and upstream errors."""
        first = self._model_for(request)
        order = [first] + self._failover(first)
        seen, tries = set(), []
        for m in order:
            if m not in seen:
                seen.add(m)
                tries.append(m)
        last: Optional[Exception] = None
        for round_no in range(BACKOFF_ROUNDS):
            wait = 0.0
            for model in tries[:CHAIN_LEN]:
                try:
                    resp = await super().generate(request.model_copy(update={"model_name": model}))
                    self.last_used = model
                    return resp
                except httpx.HTTPStatusError as ex:
                    last = ex
                    if ex.response.status_code not in RETRYABLE:
                        raise
                    if ex.response.status_code == 429:
                        try:
                            wait = max(wait, float(ex.response.headers.get("retry-after") or 0))
                        except ValueError:
                            pass
                        wait = max(wait, 4.0 * (round_no + 1))
                except (httpx.TimeoutException, httpx.TransportError) as ex:
                    last = ex
            if round_no + 1 < BACKOFF_ROUNDS and wait:      # every model rate-limited: wait, then try the chain again
                await asyncio.sleep(min(wait, MAX_BACKOFF_S))
            elif not wait:
                break
        raise last or RuntimeError("no gateway model answered")

    async def generate_stream(self, request):
        """Streams from the requested model, moving down the chain only while nothing has been yielded yet."""
        first = self._model_for(request)
        tries = list(dict.fromkeys([first] + self._failover(first)))
        last: Optional[Exception] = None
        for model in tries[:CHAIN_LEN]:
            started = False
            try:
                async for delta in super().generate_stream(request.model_copy(update={"model_name": model})):
                    started = True
                    self.last_used = model
                    yield delta
                if started:
                    return
            except httpx.HTTPStatusError as ex:
                if started or ex.response.status_code not in RETRYABLE:
                    raise
                last = ex
            except (httpx.TimeoutException, httpx.TransportError) as ex:
                if started:
                    raise
                last = ex
        raise last or RuntimeError("no gateway model answered")

    def status(self) -> Dict[str, Any]:
        return {"online": self._ok, "base_url": self.base_url, "model_count": len(self._models),
                "ready_count": len(self._ready), "key_configured": bool(self.api_key), "error": self.last_error,
                "coding_chain": self._chains.get(True, []), "general_chain": self._chains.get(False, []),
                "fast_chain": self._chains.get("fast", [])}
