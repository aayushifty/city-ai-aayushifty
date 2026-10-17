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
