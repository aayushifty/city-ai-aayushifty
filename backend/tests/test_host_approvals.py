"""The approval broker: host actions wait for the Governor's decision in the HUD."""

import asyncio

import pytest

from app.execution.approvals import ApprovalBroker


@pytest.mark.asyncio
async def test_approved_request_returns_true():
    broker = ApprovalBroker()
    task = asyncio.create_task(broker.request("agent-operator", "Sandim Pokharel", "command", "List files",
                                              {"command": "Get-ChildItem"}))
    await asyncio.sleep(0.01)
    pending = broker.list_pending()
    assert len(pending) == 1 and pending[0]["status"] == "PENDING"
    assert broker.decide(pending[0]["id"], True)
    assert await task is True
    assert broker.list_pending() == []
    assert broker.list_recent()[0]["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_denied_request_returns_false():
    broker = ApprovalBroker()
    task = asyncio.create_task(broker.request("agent-webdev", "Amit Basnet", "launch", "Open notepad", {"target": "notepad"}))
    await asyncio.sleep(0.01)
    broker.decide(broker.list_pending()[0]["id"], False)
    assert await task is False
    assert broker.list_recent()[0]["status"] == "DENIED"


@pytest.mark.asyncio
async def test_unanswered_request_expires_as_denied():
    broker = ApprovalBroker()
    assert await broker.request("agent-data", "Bibek Lama", "write_file", "Write report", {"path": "C:/x.txt"}, timeout=0.05) is False
    assert broker.list_recent()[0]["status"] == "EXPIRED"


@pytest.mark.asyncio
async def test_deny_all_rejects_every_pending_request():
    broker = ApprovalBroker()
    tasks = [asyncio.create_task(broker.request("agent-operator", "Sandim Pokharel", "command", f"cmd {i}", {"command": "dir"}))
             for i in range(3)]
    await asyncio.sleep(0.01)
    assert broker.deny_all() == 3
    assert await asyncio.gather(*tasks) == [False, False, False]


def test_deciding_unknown_request_is_rejected():
    assert ApprovalBroker().decide("appr-missing", True) is False
