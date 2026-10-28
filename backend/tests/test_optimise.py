"""M5 optimisation: per-role tool sets and the FreeLLM-first provider order."""

from app.execution.tools import TOOLS, tools_catalog_prompt, tools_for
from app.providers.router import model_router


def test_roles_get_only_their_tools():
    webdev = tools_for("agent-webdev")
    assert "build_website" in webdev and "launch_app" in webdev
    assert "host_command" not in webdev and "write_host_file" not in webdev
    researcher = tools_for("agent-researcher")
    assert "web_search" in researcher and "build_app" not in researcher
    assert "host_command" in tools_for("agent-operator")
    assert "host_command" not in tools_catalog_prompt(webdev)


def test_unknown_roles_keep_every_tool():
    assert tools_for("a") == TOOLS
    assert tools_for("agent-coordinator") == TOOLS


def test_freellm_first_then_ollama():
    chain = model_router.fallback_chain
    assert chain[:2] == ["freellm", "ollama"] and chain[-1] == "mock"
