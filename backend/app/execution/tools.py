"""Capabilities available to every AI citizen during an autonomous task.

The citizen's model drives a tool-use loop. Tools fall into two groups.

* Autonomous tools run immediately: web research, reading files and directories, reading/writing and
  running whitelisted build/test commands inside the citizen's own workspace, and building
  deliverables (3D presentations, websites, apps) that get a direct browser link.
* Host actions (PowerShell on the host, launching programs, writing files outside the workspace)
  each wait for the Governor's Approve/Deny in the 3D HUD (approvals.py) and only run if approved.
  SecurityEngine.check_host_command refuses disk/OS-destroying commands before they are even shown.
"""

import asyncio
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from app.core.security import SecurityEngine, SecurityViolationError
from app.execution.computer_service import computer_service
from app.execution.runner import ProcessRunner
from app.execution.approvals import approval_broker

MAX_OBSERVATION_CHARS = 4000


@dataclass
class ToolContext:
    """Per-run state handed to tools."""
    agent_id: str
    agent_name: str
    profession: str
    workspace: Path
    model_name: Optional[str]
    provider: Optional[str]
    task_id: str
    deliverables: List[Dict[str, Any]] = field(default_factory=list)
    on_progress: Optional[Callable[[str], Awaitable[None]]] = None
    on_reason: Optional[Callable[[str, str], Awaitable[None]]] = None  # (kind, summary) -> live reasoning feed
    should_stop: Optional[Callable[[], bool]] = None

    async def note(self, message: str) -> None:
        if self.on_progress:
            await self.on_progress(message)

    def stopped(self) -> bool:
        return bool(self.should_stop and self.should_stop())


@dataclass
class ToolSpec:
    name: str
    description: str
    args: Dict[str, str]
    handler: Callable[["ToolContext", Dict[str, Any]], Awaitable[str]]
    autonomous: bool = True


def _truncate(text: str, limit: int = MAX_OBSERVATION_CHARS) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 60] + f"\n... [truncated, {len(text)} chars total]"


def _safe_workspace_path(ctx: ToolContext, relative: str) -> Path:
    """Resolves a path strictly inside the citizen's workspace."""
    return SecurityEngine.validate_path_in_workspace(relative, ctx.workspace)


# --------------------------------------------------------------------------- #
# Autonomous tools
# --------------------------------------------------------------------------- #

async def _tool_write_workspace_file(ctx: ToolContext, args: Dict[str, Any]) -> str:
    rel = str(args.get("path", "")).strip()
    content = args.get("content", "")
    if not rel:
        return "ERROR: 'path' is required."
    try:
        target = _safe_workspace_path(ctx, rel)
    except SecurityViolationError as e:
        return f"ERROR: {e}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    await ctx.note(f"Wrote {rel} ({len(content)} chars)")
    return f"OK: wrote {len(content)} chars to workspace file '{rel}'."


async def _tool_read_file(ctx: ToolContext, args: Dict[str, Any]) -> str:
    path = str(args.get("path", "")).strip()
    if not path:
        return "ERROR: 'path' is required."
    res = computer_service.read_host_file(path, max_chars=MAX_OBSERVATION_CHARS)
    if not res.get("success"):
        return f"ERROR: {res.get('error')}"
    return f"{path} ({res['lines']} lines):\n{res['content']}"


async def _tool_list_dir(ctx: ToolContext, args: Dict[str, Any]) -> str:
    path = str(args.get("path", ".")).strip() or "."
    res = computer_service.list_directory(path)
    if not res.get("success"):
        return f"ERROR: {res.get('error')}"
    lines = [f"{res['path']} ({res['total_items']} items):"]
    for it in res["items"][:60]:
        lines.append(f"  {'[dir] ' if it['is_dir'] else ''}{it['name']}")
    return "\n".join(lines)


async def _tool_run_in_workspace(ctx: ToolContext, args: Dict[str, Any]) -> str:
    """Runs a whitelisted build/test command inside the sandbox workspace (SecurityEngine policy applies)."""
    command = str(args.get("command", "")).strip()
    if not command:
        return "ERROR: 'command' is required."
    try:
        SecurityEngine.validate_command_policy(command)
    except SecurityViolationError as e:
        return (f"ERROR: '{command}' is not allowed as an autonomous sandbox command ({e}). "
                "If it must run on the host, use host_command (needs approval).")
    result = await ProcessRunner.run_command(command, cwd=ctx.workspace, timeout_seconds=90)
    await ctx.note(f"Ran `{command}` (exit {result.exit_code})")
    out = (result.stdout or "") + (f"\nSTDERR:\n{result.stderr}" if result.stderr else "")
    return f"exit_code={result.exit_code}\n{_truncate(out)}"


async def _tool_web_search(ctx: ToolContext, args: Dict[str, Any]) -> str:
    query = str(args.get("query", "")).strip()
    if not query:
        return "ERROR: 'query' is required."
    await ctx.note(f"Searching the web: {query}")
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 city_ai_aayushifty"}) as client:
            resp = await client.get("https://html.duckduckgo.com/html/", params={"q": query})
            resp.raise_for_status()
            text = resp.text
    except Exception as e:
        return f"ERROR: web search failed: {e}"
    results = []
    for m in re.finditer(r'result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', text, re.DOTALL):
        href, title = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if title:
            results.append(f"- {title}\n  {href}")
        if len(results) >= 8:
            break
    return "Top results:\n" + "\n".join(results) if results else "No results found."


async def _tool_web_fetch(ctx: ToolContext, args: Dict[str, Any]) -> str:
    url = str(args.get("url", "")).strip()
    if not url.startswith(("http://", "https://")):
        return "ERROR: 'url' must start with http:// or https://."
    await ctx.note(f"Reading {url}")
    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 city_ai_aayushifty"}) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            body = resp.text
    except Exception as e:
        return f"ERROR: fetch failed: {e}"
    text = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", body)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return _truncate(text)


async def _tool_build_presentation(ctx: ToolContext, args: Dict[str, Any]) -> str:
    topic = str(args.get("topic", "")).strip() or "Untitled"
    slides = args.get("slides")
    content = {"slides": slides} if isinstance(slides, list) else None
    artifact = computer_service.synthesize_3d_presentation(
        topic=topic, citizen_name=ctx.agent_name, citizen_profession=ctx.profession,
        task_id=ctx.task_id, content=content)
    rec = _deliverable_record(artifact, "3D_PRESENTATION", ctx)
    await ctx.note(f"Built 3D presentation: {topic}")
    return f"OK: built 3D presentation '{artifact.title}'. Link: {rec['url']}"


async def _tool_build_website(ctx: ToolContext, args: Dict[str, Any]) -> str:
    topic = str(args.get("topic", "")).strip() or "Untitled"
    content = args.get("content") if isinstance(args.get("content"), dict) else None
    artifact = computer_service.synthesize_website(
        topic=topic, citizen_name=ctx.agent_name, citizen_profession=ctx.profession,
        task_id=ctx.task_id, content=content)
    rec = _deliverable_record(artifact, "WEBSITE", ctx)
    await ctx.note(f"Built website: {topic}")
    return f"OK: built website '{artifact.title}'. Link: {rec['url']}"


async def _tool_build_app(ctx: ToolContext, args: Dict[str, Any]) -> str:
    title = str(args.get("title", "")).strip() or "Interactive App"
    html = args.get("html", "")
    if not html or "<" not in html:
        return "ERROR: 'html' must be a complete HTML document for the app."
    artifact = computer_service.save_html_app(title=title, html=html, citizen_name=ctx.agent_name, task_id=ctx.task_id)
    rec = _deliverable_record(artifact, "APP", ctx)
    await ctx.note(f"Built app: {title}")
    return f"OK: built app '{artifact.title}'. Link: {rec['url']}"


# --------------------------------------------------------------------------- #
# Host actions: each one waits for the Governor's Approve/Deny in the 3D HUD
# --------------------------------------------------------------------------- #

async def _await_approval(ctx: ToolContext, kind: str, summary: str, detail: Dict[str, Any]) -> bool:
    await ctx.note(f"Waiting for your approval: {summary[:60]}")
    return await approval_broker.request(ctx.agent_id, ctx.agent_name, kind, summary, detail, ctx.task_id)


async def _tool_host_command(ctx: ToolContext, args: Dict[str, Any]) -> str:
    command = str(args.get("command", "")).strip()
    reason = str(args.get("reason", "")).strip()
    if not command:
        return "ERROR: 'command' is required."
    try:
        SecurityEngine.check_host_command(command)
    except SecurityViolationError as e:
        return f"REJECTED: {e}"
    cwd = str(args.get("cwd", "")).strip() or str(ctx.workspace)
    if not await _await_approval(ctx, "command", reason or command, {"command": command, "cwd": cwd}):
        return "DENIED by the Governor. Do not retry this command; continue another way or finish."
    res = await asyncio.to_thread(computer_service.execute_shell_command, command, 120, cwd, ctx.agent_name)
    out = (res.get("stdout") or "") + (f"\nSTDERR:\n{res['stderr']}" if res.get("stderr") else "")
    return f"APPROVED and ran. exit_code={res['exit_code']}\n{_truncate(SecurityEngine.redact_secrets(out)) or '(no output)'}"


async def _tool_launch_app(ctx: ToolContext, args: Dict[str, Any]) -> str:
    target = str(args.get("target", "")).strip()
    if not target:
        return "ERROR: 'target' is required."
    if not await _await_approval(ctx, "launch", f"Open {target}", {"target": target}):
        return f"DENIED by the Governor: did not open '{target}'."
    res = await asyncio.to_thread(computer_service.launch_application, target, ctx.agent_name)
    return ("OK: " if res.get("success") else "ERROR: ") + res.get("message", "")


async def _tool_write_host_file(ctx: ToolContext, args: Dict[str, Any]) -> str:
    path = str(args.get("path", "")).strip()
    content = args.get("content", "")
    if not isinstance(content, str):
        content = str(content)
    if not path:
        return "ERROR: 'path' is required."
    preview = content[:600] + ("..." if len(content) > 600 else "")
    if not await _await_approval(ctx, "write_file", f"Write {len(content)} chars to {path}",
                                 {"path": path, "preview": preview}):
        return f"DENIED by the Governor: did not write '{path}'."
    res = await asyncio.to_thread(computer_service.write_host_file, path, content, ctx.agent_name)
    return f"OK: wrote {res['path']}" if res.get("success") else f"ERROR: {res.get('error')}"


async def _tool_publish_folder(ctx: ToolContext, args: Dict[str, Any]) -> str:
    rel = str(args.get("path", ".")).strip() or "."
    title = str(args.get("title", "")).strip() or "Web App"
    try:
        folder = _safe_workspace_path(ctx, rel)
        artifact = await asyncio.to_thread(computer_service.publish_folder, folder, title, ctx.agent_name, ctx.task_id)
    except Exception as e:
        return f"ERROR: {e}"
    rec = _deliverable_record(artifact, "APP", ctx)
    await ctx.note(f"Published {title}")
    return f"OK: published '{artifact.title}'. Link: {rec['url']}"


def _deliverable_record(artifact, dtype: str, ctx: Optional[ToolContext] = None) -> Dict[str, Any]:
    if ctx is not None:
        artifact.agent_id = ctx.agent_id
        artifact.agent_name = ctx.agent_name
    if not artifact.url:
        artifact.url = computer_service.public_url(artifact.relative_path)
    rec = {
        "artifact_id": artifact.id,
        "task_id": artifact.task_id,
        "title": artifact.title,
        "type": dtype,
        "file_path": artifact.file_path,
        "relative_path": artifact.relative_path,
        "url": artifact.url,
        "artifact": artifact,
    }
    if ctx is not None:
        ctx.deliverables.append(rec)
    return rec


TOOLS: Dict[str, ToolSpec] = {
    "write_workspace_file": ToolSpec(
        "write_workspace_file", "Create or overwrite a file inside your sandbox workspace.",
        {"path": "relative path", "content": "full file content"}, _tool_write_workspace_file),
    "read_file": ToolSpec(
        "read_file", "Read any file on the host computer.",
        {"path": "absolute or relative path"}, _tool_read_file),
    "list_dir": ToolSpec(
        "list_dir", "List the contents of any directory on the host computer.",
        {"path": "directory path"}, _tool_list_dir),
    "run_in_workspace": ToolSpec(
        "run_in_workspace", "Run a build/test command (python, pytest, node, npm, git, pip, ...) inside your workspace.",
        {"command": "command line"}, _tool_run_in_workspace),
    "web_search": ToolSpec(
        "web_search", "Search the web and get a list of result links.",
        {"query": "search query"}, _tool_web_search),
    "web_fetch": ToolSpec(
        "web_fetch", "Fetch a web page and return its readable text.",
        {"url": "http(s) url"}, _tool_web_fetch),
    "build_presentation": ToolSpec(
        "build_presentation", "Build an interactive 3D WebGL presentation. Provide slides you authored.",
        {"topic": "title", "slides": "[{title, desc, bullets:[...]}]"}, _tool_build_presentation),
    "build_website": ToolSpec(
        "build_website", "Build a responsive website. Provide content you authored.",
        {"topic": "title", "content": "{brand, headline, subheadline, features:[{icon,title,text}], metrics:[{value,label}]}"},
        _tool_build_website),
    "build_app": ToolSpec(
        "build_app", "Build a self-contained interactive web app from a complete HTML document you wrote.",
        {"title": "app title", "html": "full HTML document"}, _tool_build_app),
    "publish_folder": ToolSpec(
        "publish_folder", "Publish a multi-file web app folder from your workspace (must contain index.html). Returns a direct link.",
        {"path": "folder path inside workspace", "title": "title"}, _tool_publish_folder),
    "host_command": ToolSpec(
        "host_command", "Run a PowerShell command on the Governor's computer. Waits for the Governor's Approve/Deny first.",
        {"command": "powershell command", "reason": "one line on why", "cwd": "optional working directory"},
        _tool_host_command, autonomous=False),
    "launch_app": ToolSpec(
        "launch_app", "Open a program, file, folder or URL on the Governor's desktop. Waits for approval first.",
        {"target": "app name, path or URL"}, _tool_launch_app, autonomous=False),
    "write_host_file": ToolSpec(
        "write_host_file", "Write a file outside your workspace on the Governor's computer. Waits for approval first.",
        {"path": "absolute path", "content": "file content"}, _tool_write_host_file, autonomous=False),
}


def tools_catalog_prompt() -> str:
    """Renders the tool list for the system prompt."""
    lines = []
    for spec in TOOLS.values():
        arg_str = ", ".join(f"{k}: {v}" for k, v in spec.args.items())
        tag = "" if spec.autonomous else " [needs Governor approval]"
        lines.append(f'- {spec.name}({arg_str}){tag}: {spec.description}')
    return "\n".join(lines)
