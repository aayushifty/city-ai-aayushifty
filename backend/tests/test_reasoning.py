"""Live reasoning: citizens stream plan / thought summaries / tool calls and results into their own feed, the event
bus and (for mission work) the mission channel, labelled with name and role."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.testclient import TestClient

from app.core.event_bus import event_bus
from app.execution import agent_loop
from app.execution.tools import ToolContext
from tests.test_mission_channel import run, svc  # noqa: F401  (fixture reuse)


@pytest.mark.asyncio
async def test_reason_streams_to_feed_bus_and_mission_channel(svc):
    citizen = svc.get_citizen("agent-webdev")
    mission = {"id": "m-1", "channel": [], "subtasks": []}
    svc.public_missions.insert(0, mission)
    svc.history.start("t-1", citizen.id, citizen.name, "Build it", mission_id="m-1")
    seen = []

    async def grab(ev):
        seen.append(ev)
    event_bus.subscribe_all(grab)
    try:
        await svc._reason(citizen, "t-1", "plan", "Taking on   'Build it'\n- deliverable: site")
        await svc._reason(citizen, "t-1", "bogus", "x" * 900)
    finally:
        event_bus.unsubscribe_all(grab)

    steps = svc.get_reasoning(citizen.id)
    assert [s["kind"] for s in steps] == ["plan", "thought"]
    assert steps[0]["text"] == "Taking on 'Build it' - deliverable: site" and len(steps[1]["text"]) == 600
    assert steps[0]["role"] == citizen.profession and steps[0]["mission_id"] == "m-1"
    assert any(e.topic == f"agent:{citizen.id}:reasoning" for e in seen)
    post = mission["channel"][0]
    assert post["kind"] == "reasoning" and post["step"] == "plan" and post["role"] == citizen.profession
    assert post["author_name"] == citizen.name


@pytest.mark.asyncio
async def test_full_mission_posts_reasoning_into_channel(svc, monkeypatch):
    mission, _, _ = await run(svc, monkeypatch)
    reasoning = [p for p in mission["channel"] if p["kind"] == "reasoning"]
    assert reasoning, "the building citizen streams its steps into the channel"
    assert {p["step"] for p in reasoning} >= {"plan"} and all(p.get("role") for p in reasoning)
    assert svc.get_reasoning("agent-webdev")


@pytest.mark.asyncio
async def test_agent_loop_reports_thought_tool_call_and_result(monkeypatch):
    replies = iter([{"thought": "list the files first", "tool": "nope_tool", "args": {}},
                    {"thought": "done", "final": "ok"}])

    async def fake(req, preferred_provider=None, **kw):
        return SimpleNamespace(content=json.dumps(next(replies)), model_name="m", provider_name="t")
    monkeypatch.setattr(agent_loop.model_router, "route_completion", fake)
    got = []

    async def on_reason(kind, text):
        got.append((kind, text))
    ctx = ToolContext(agent_id="a", agent_name="A", profession="Dev", task_id="t", workspace=Path("."),
                      model_name="m", provider="ollama", on_reason=on_reason)
    out = await agent_loop.run_agent_loop(ctx, "T", "D", "E", max_steps=3)
    assert out["reached_final"] and got[0] == ("thought", "list the files first") and got[-1] == ("thought", "done")


def test_reasoning_route(monkeypatch):
    from app.api import routes_agents
    from app.main import app
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/agents/nobody/reasoning").status_code == 404
    r = client.get("/api/agents/agent-webdev/reasoning?limit=5")
    assert r.status_code == 200 and r.json()["agent_id"] == "agent-webdev" and isinstance(r.json()["steps"], list)
