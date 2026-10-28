import pytest
from app.providers.router import ModelRouter
from app.providers.base import ModelCompletionRequest
from app.providers.mock_provider import MockModelProvider

@pytest.mark.asyncio
async def test_mock_provider_deterministic_response():
    router = ModelRouter()
    req = ModelCompletionRequest(
        prompt="Analyze this school management platform",
        system_prompt="You are the FORGE AI product analyst."
    )
    resp = await router.route_completion(req, preferred_provider="mock")
    assert resp.provider_name == "mock"
    assert "specification" in resp.content.lower() or "features" in resp.content.lower()

@pytest.mark.asyncio
async def test_router_fallback_to_mock():
    router = ModelRouter()
    # Request unavailable provider and verify fallback to mock
    router.fallback_chain = ["unavailable_provider_1", "unavailable_provider_2", "mock"]
    req = ModelCompletionRequest(prompt="Test fallback")
    resp = await router.route_completion(req, preferred_provider="non_existent_provider")
    assert resp.provider_name == "mock"
    assert resp.is_fallback is True


class _FakeStreamer:
    def __init__(self, tokens, fail_after=None):
        self.tokens, self.fail_after = tokens, fail_after

    async def is_available(self):
        return True

    async def generate_stream(self, request):
        for i, t in enumerate(self.tokens):
            if self.fail_after is not None and i >= self.fail_after:
                raise RuntimeError("boom")
            yield t


@pytest.mark.asyncio
async def test_stream_falls_to_next_provider_before_first_token():
    router = ModelRouter()
    router._providers["freellm"] = _FakeStreamer(["x"], fail_after=0)
    router._providers["ollama"] = _FakeStreamer(["he", "llo"])
    router.fallback_chain = ["freellm", "ollama", "mock"]
    out = [t async for t in router.route_completion_stream(ModelCompletionRequest(prompt="hi"), "freellm")]
    assert out == ["he", "llo"]


@pytest.mark.asyncio
async def test_stream_stops_when_provider_breaks_mid_reply():
    router = ModelRouter()
    router._providers["freellm"] = _FakeStreamer(["a", "b", "c"], fail_after=1)
    router._providers["ollama"] = _FakeStreamer(["never"])
    router.fallback_chain = ["freellm", "ollama", "mock"]
    out = [t async for t in router.route_completion_stream(ModelCompletionRequest(prompt="hi"), "freellm")]
    assert out == ["a"]
