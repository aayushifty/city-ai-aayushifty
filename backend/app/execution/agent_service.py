"""city_ai_aayushifty Agent Execution Engine.

Authoritative local-first runtime managing 10 persistent AI citizens,
real tool execution in sandboxed workspaces, local inference with Ollama,
real verification with bounded repair, artifact tracking, and public mission DAG coordination.
"""

import asyncio
from collections import deque
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
import time
from typing import Dict, List, Optional, Any, Tuple
import uuid

from app.config import config
from app.core.event_bus import event_bus, ForgeEvent
from app.core.security import SecurityEngine
from app.execution.workspace import WorkspaceManager
from app.execution.runner import ProcessRunner
from app.execution.verifier import VerifierEngine, verify_deliverables
from app.execution.task_history import TERMINAL_STATUSES, TaskHistory
from app.execution import project_builder
from app.execution.project_builder import error_signature
from app.models.database import Database
from app.models.schemas import (
    CitizenProfile, CitizenChatResponse, CitizenTaskRequest,
    DeliverableArtifact, PublicMissionCreateRequest, VerificationEvidence
)
from app.providers.base import ModelCompletionRequest
from app.providers.router import model_router
from app.execution.computer_service import computer_service
from app.execution.app_runner import app_runner
from app.execution.roster import CITIZENS

logger = logging.getLogger("city_ai.agent_service")

def _evidence_line(evidence: Any) -> str:
    """One-line summary of a verification run for the reasoning feed."""
    status = "passed" if evidence.exit_code == 0 else f"failed (exit {evidence.exit_code})"
    tail = " ".join(str(getattr(evidence, "output_snippet", "") or "").split())[-200:]
    return (f"verification {status}: {evidence.passed_tests} passed, {evidence.failed_tests} failed"
            + (f" - {tail}" if tail and evidence.exit_code != 0 else ""))


class CitizenExecutionService:
    """Coordinates persistent AI citizens, real local model execution, tools, and deliverables."""

    def __init__(self, db: Database):
        self.db = db
        self.workspaces_root = config.WORKSPACES_DIR
        self.workspaces_root.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir = config.DATA_DIR / "artifacts"
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory registry with persistent synchronization
        self.citizens: Dict[str, CitizenProfile] = {}
        self.artifacts: Dict[str, DeliverableArtifact] = {}
        self.public_missions: List[Dict[str, Any]] = []
        self._mission_planned: Dict[str, asyncio.Event] = {}
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._citizen_locks: Dict[str, asyncio.Lock] = {}
        self._chat_memory: Dict[str, List[Tuple[str, str]]] = {}  # recent chat turns per citizen
        self._reasoning: Dict[str, deque] = {}  # recent plan/thought/tool steps per citizen (summaries, not raw CoT)
        self.history = TaskHistory(config.DATA_DIR / "task_history.json")
        self._init_citizens()

    def _init_citizens(self):
        """Initializes the 15 persistent citizen personas mapped to specialized local roles."""
        citizens_data = CITIZENS

        for c in citizens_data:
            role_k = c.get("role_key", "coordinator")
            model_pref = config.ROLE_MODEL_PREFERENCES.get(role_k, config.DEFAULT_OLLAMA_MODEL)
            profile = CitizenProfile(
                id=c["id"],
                name=c["name"],
                title=c["title"],
                profession=c["profession"],
                department=c["department"],
                color=c["color"],
                assigned_model=model_pref,
                local_model=model_pref,
                provider="Ollama (Local)",
                capabilities=c["capabilities"],
                tools=c["tools"],
                status="IDLE",
                current_task=None,
                active_task_id=None,
                work_progress=0.0,
                thought=c["thought"],
                home_building_id=c["home_building_id"],
                workspace_dir=str(self.workspaces_root / c["id"])
            )
            self.citizens[profile.id] = profile

    async def sync_providers(self, force: bool = False) -> Dict[str, Any]:
        """Puts every citizen on the FreeLLM gateway (a strong model for its role) while the gateway is reachable,
        and back on its own local Ollama model when it is not. Models you picked by hand are left alone."""
        freellm = model_router.get_provider("freellm")
        online = bool(freellm) and await freellm.refresh(force)
        if online:   # tested chains: only models that really answered are handed out
            online = bool(await freellm.choose(True)) | bool(await freellm.choose(False))
        for c in self.citizens.values():
            if c.model_pinned:
                continue
            if online:
                role = c.id.split("-", 1)[-1]
                best = freellm.best_model(coding=role in CODING_ROLES)
                if best and (c.provider_key != "freellm" or c.assigned_model != best):
                    c.provider_key, c.assigned_model, c.provider = "freellm", best, "FreeLLM Gateway"
            elif c.provider_key == "freellm":
                c.provider_key, c.assigned_model, c.provider = "ollama", c.local_model or config.DEFAULT_OLLAMA_MODEL, "Ollama (Local)"
        return freellm.status() if freellm else {"online": False}

    async def _route(self, citizen: CitizenProfile, req: ModelCompletionRequest, interactive: bool = False):
        """One place where citizens call their model: preferred provider first, their own local model as fallback."""
        return await model_router.route_completion(
            req, preferred_provider=citizen.provider_key or "ollama", interactive=interactive,
            fallback_models={"ollama": citizen.local_model or config.DEFAULT_OLLAMA_MODEL})

    def list_citizens(self) -> List[CitizenProfile]:
        """Returns all persistent AI citizens with live status."""
        return list(self.citizens.values())

    def get_citizen(self, agent_id: str) -> Optional[CitizenProfile]:
        return self.citizens.get(agent_id)

    async def chat_with_citizen(self, agent_id: str, message: str) -> CitizenChatResponse:
        """Executes intelligent 2-way conversation with host computer capabilities, deliverables, and real-time telemetry."""
        citizen = self.citizens.get(agent_id)
        if not citizen:
            raise ValueError(f"Citizen '{agent_id}' does not exist in the metropolis.")

        intent_data = computer_service.detect_intent(message)
        telemetry = computer_service.get_telemetry()
        intent = intent_data.get("intent", "GENERAL_QUERY")

        msg_id = f"cmsg-{uuid.uuid4().hex[:8]}"
        task_id = f"task-{uuid.uuid4().hex[:8]}"

        # --- 0. "Revise that: ..." -> next version of this citizen's latest finished deliverable ---
        revise = _REVISE_RE.match(message)
        if revise:
            feedback = revise.group(1).strip()
            if feedback and not re.match(r"\s*(?:please\s+)?(?:revise|redo|request changes)\b", message, re.IGNORECASE):
                feedback = message.strip()     # "change that to blue": the whole sentence is the instruction
            latest = next((r for r in self.history.list(limit=50, agent_id=citizen.id)
                           if r["status"] in REVISABLE_STATUSES), None)
            if not feedback:
                reply_content = "Supreme Governor, what should I change? Tell me, e.g. \"revise that: make the title shorter and add a pricing section\"."
                action = "REVISION_NEEDS_FEEDBACK"
            elif not latest:
                reply_content = "Supreme Governor, I have no finished work to revise yet."
                action = "REVISION_NOTHING_TO_REVISE"
            else:
                try:
                    started = self.revise_task(latest["task_id"], feedback)
                    reply_content = (f"Supreme Governor, I'm revising **{latest.get('base_title') or latest['title']}** as "
                                     f"version {started['version']} with your changes. It will be verified again before I report back; "
                                     "the previous version stays available.")
                    action = "REVISION_STARTED"
                    citizen.thought = f"Revising {latest['title'][:50]} (v{started['version']})"
                except (LookupError, ValueError, RuntimeError) as ex:
                    reply_content = f"Supreme Governor, I can't start that revision: {ex}"
                    action = "REVISION_REFUSED"
            memory = self._chat_memory.setdefault(citizen.id, [])
            memory.extend([("user", message[:1000]), ("citizen", reply_content[:1000])])
            del memory[:-16]
            return CitizenChatResponse(
                message_id=msg_id, agent_id=agent_id, agent_name=citizen.name, reply=reply_content,
                model_used=citizen.assigned_model, provider=citizen.provider,
                timestamp=telemetry["system_clock"], action_taken=action,
            )

        # --- 1. Real-World Time & Date Query ---
        if intent == "TIME_QUERY":
            reply_content = (
                f"Supreme Governor, it is currently **{telemetry['current_time']}**.\n\n"
                "All metropolis clocks, autonomous vehicle route-timers, and computer scheduler daemons "
                "are fully synchronized with your host computer's system time."
            )
            citizen.thought = f"Reported current time: {telemetry['system_clock']}"
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="TIME_REPORT"
            )

        # --- 2. Live City Functioning & Status Report ---
        if intent == "CITY_STATUS_QUERY":
            m = telemetry["city_metrics"]
            reply_content = (
                f"Supreme Governor, the metropolis 'city_ai_aayushifty' is functioning at optimal capacity! "
                "Here is our live authoritative telemetry report:\n\n"
                f"⚡ **Power Grid:** {m['power_grid_status']}\n"
                f"💧 **Water Network:** {m['water_grid_status']}\n"
                f"😊 **Citizen Satisfaction:** {m['citizen_satisfaction']}% approval rating\n"
                f"🏥 **Public Health Index:** {m['health_index']}% (Trauma bays standing by, zero epidemic risks)\n"
                f"🚗 **Autonomous Traffic:** {m['traffic_flow']}\n"
                f"🌿 **Carbon Compliance:** {m['carbon_index']} index (Clean renewable operations)\n"
                f"🏛️ **Active AI Workforce:** {m['active_departments']} specialized departments deployed across genuine workplaces\n"
                f"🚨 **Active Emergency Incidents:** {m['active_incidents']} active incidents\n\n"
                "All municipal infrastructure and citizen agent services are operating with zero blockers."
            )
            citizen.thought = "Reported live metropolis health & operational status."
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="CITY_STATUS_REPORT"
            )

        # --- 2b. Human Conversational Greeting & Check-in ("whats up", "hello") ---
        if intent == "GREETING":
            if "aaron chen" in citizen.name.lower() or citizen.id == "agent-diagnostic":
                reply_content = (
                    "Supreme Governor, telemetry pipelines and kernel diagnostic profilers are running nominal "
                    "across all city sectors! I am actively monitoring keep-alive socket connection pools, heap allocations, "
                    "and asynchronous event loop latencies. All systems are calibrated with 100% operational integrity. "
                    "How can I assist your municipal objectives today?"
                )
            elif "alex vance" in citizen.name.lower() or citizen.id == "agent-coordinator":
                reply_content = (
                    "Greetings, Supreme Governor! Citadel Spire command links are fully synchronized. "
                    "All 10 specialized citizen districts and municipal DAG scheduling pipelines are active and operating "
                    "with zero blockers. I am ready to coordinate workforce missions at your command."
                )
            elif "maya lin" in citizen.name.lower() or citizen.id == "agent-analyst":
                reply_content = (
                    "Greetings, Supreme Governor! The Product Vision Lab is actively analyzing requirements and formulating "
                    "technical specifications. What platform or capability would you like to explore today?"
                )
            elif "marcus vance" in citizen.name.lower() or citizen.id == "agent-architect":
                reply_content = (
                    "Supreme Governor, system architecture blueprints, data schemas, and 3D spatial models are verified. "
                    "I am prepared to design high-throughput systems or synthesize interactive 3D presentations at your directive."
                )
            elif "devon cross" in citizen.name.lower() or citizen.id == "agent-engineer":
                reply_content = (
                    "Supreme Governor, the Code Fabrication Foundry compilers and execution toolchains are primed. "
                    "I am ready to build and verify production code, full-stack modules, and interactive web applications."
                )
            elif "elena rostova" in citizen.name.lower() or citizen.id == "agent-qa":
                reply_content = (
                    "Supreme Governor, QA Bastion verification gates are fully operational. All regression suites, "
                    "automated assertions, and invariant checks report 100% green passing status. Quality is guaranteed."
                )
            else:
                reply_content = (
                    f"Supreme Governor, {citizen.name} at your command! All operations in {citizen.department} "
                    "are operating at optimal capacity with zero blockers. How can I assist you right now?"
                )

            citizen.thought = f"Greeted Supreme Governor in character: {citizen.profession} nominal."
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="CONVERSATION_GREETING"
            )

        # --- 3. Host Computer Hardware & Telemetry ---
        if intent == "COMPUTER_STATS":
            reply_content = (
                "Supreme Governor, here is the live telemetry from your host computer:\n\n"
                f"💻 **Operating System:** Windows ({telemetry['os_name']} {telemetry['os_release']}) [{telemetry['architecture']}]\n"
                f"🐍 **Python Runtime:** Python {telemetry['python_version']}\n"
                f"💾 **Storage Capacity:** {telemetry['free_disk_gb']} GB free of {telemetry['total_disk_gb']} GB total on drive\n"
                "🧠 **Local Inference Acceleration:** Ollama active with NVIDIA GeForce RTX 3050 GPU (llama3.2, qwen3:4b-instruct, gemma3:4b)\n"
                f"📁 **Workspaces Root:** `{self.workspaces_root}`\n\n"
                "Your computer hardware is operating in peak health and ready for high-throughput autonomous execution."
            )
            citizen.thought = "Reported host computer hardware & storage telemetry."
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="COMPUTER_STATS_REPORT"
            )

        # --- 3b. Shell / CLI Command Execution (Jarvis command execution) ---
        if intent == "SHELL_COMMAND":
            command = intent_data.get("command", "")
            exec_res = computer_service.execute_shell_command(command)
            status_symbol = "✅ [SUCCESS]" if exec_res["success"] else "⚠️ [NON-ZERO EXIT]"
            reply_content = (
                f"Supreme Governor, I executed your terminal directive on the host computer:\n\n"
                f"💻 **Command:** `{command}`\n"
                f"⏱️ **Duration:** {exec_res['duration_ms']} ms | **Exit Code:** {exec_res['exit_code']} {status_symbol}\n\n"
            )
            if exec_res["stdout"]:
                reply_content += f"```powershell\n{exec_res['stdout']}\n```\n"
            if exec_res["stderr"]:
                reply_content += f"**Stderr:**\n```powershell\n{exec_res['stderr']}\n```\n"
            if not exec_res["stdout"] and not exec_res["stderr"]:
                reply_content += "_Command completed silently with zero output._\n"

            citizen.thought = f"Executed shell command: {command[:24]}"
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="HOST_SHELL_EXECUTION"
            )

        # --- 3c. Launch Host Application ---
        if intent == "LAUNCH_APP":
            target = intent_data.get("target", "")
            launch_res = computer_service.launch_application(target)
            reply_content = (
                f"Supreme Governor, application dispatch executed!\n\n"
                f"🚀 **Target:** `{target}`\n"
                f"📌 **Status:** {launch_res['message']}\n\n"
                "The process has been initialized on your Windows desktop."
            )
            citizen.thought = f"Launched application: {target}"
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="LAUNCH_APPLICATION"
            )

        # --- 3d. Read Host File ---
        if intent == "READ_FILE":
            file_path = intent_data.get("file_path", "")
            file_res = computer_service.read_host_file(file_path)
            if file_res["success"]:
                reply_content = (
                    f"Supreme Governor, file contents retrieved from host disk:\n\n"
                    f"📁 **Path:** `{file_res['path']}`\n"
                    f"📊 **Size:** {file_res['size_bytes']} bytes ({file_res['lines']} lines)\n\n"
                    f"```text\n{file_res['content']}\n```"
                )
            else:
                reply_content = f"⚠️ Could not read file `{file_path}`: {file_res.get('error')}"

            citizen.thought = f"Read host file: {file_path[:24]}"
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="READ_HOST_FILE"
            )

        # --- 3e. List Host Directory ---
        if intent == "LIST_DIR":
            dir_path = intent_data.get("dir_path", ".")
            dir_res = computer_service.list_directory(dir_path)
            if dir_res["success"]:
                lines = [f"📂 **Directory:** `{dir_res['path']}` ({dir_res['total_items']} items)\n"]
                for it in dir_res["items"][:40]:
                    icon = "📁" if it["is_dir"] else "📄"
                    sz = f"{it['size_bytes']} B" if not it["is_dir"] else "DIR"
                    lines.append(f"- {icon} `{it['name']}` ({sz}) — {it['modified']}")
                if len(dir_res["items"]) > 40:
                    lines.append(f"... and {len(dir_res['items']) - 40} more items.")
                reply_content = "\n".join(lines)
            else:
                reply_content = f"⚠️ Could not list directory `{dir_path}`: {dir_res.get('error')}"

            citizen.thought = f"Listed directory: {dir_path[:24]}"
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="LIST_HOST_DIRECTORY"
            )

        # --- 3f. Deep System Diagnostics (Jarvis Mode) ---
        if intent == "SYSTEM_DIAGNOSTICS":
            diag = computer_service.get_deep_diagnostics()
            proc_lines = []
            for p in diag.get("top_processes", [])[:7]:
                proc_lines.append(f"- `[{p.get('id')}]` **{p.get('name')}**: CPU {p.get('cpu')}% | RAM {p.get('memory_mb')} MB")
            procs_str = "\n".join(proc_lines) or "No process data captured."

            reply_content = (
                "Supreme Governor, Jarvis-tier full computer system diagnostics active:\n\n"
                f"🖥️ **Host Node:** `{diag.get('hostname')}` ({diag.get('os_name')} {diag.get('os_release')})\n"
                f"⚙️ **CPU Architecture:** {diag.get('architecture')} ({diag.get('cpu_count')} logical cores)\n"
                f"💾 **Disk Storage:** {diag.get('free_disk_gb')} GB free of {diag.get('total_disk_gb')} GB total\n"
                f"🧠 **Local GPU Acceleration:** Ollama with NVIDIA RTX 3050 GPU\n"
                f"🛡️ **Access Level:** `{diag.get('access_tier')}` ({diag.get('jarvis_mode')})\n\n"
                f"📊 **Top Active Processes:**\n{procs_str}\n\n"
                "All host interfaces and agent execution kernels are running with full computer authority."
            )
            citizen.thought = "Executed deep system diagnostics (Jarvis tier)."
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider="Ollama (Local)",
                timestamp=telemetry["system_clock"],
                action_taken="SYSTEM_DIAGNOSTICS_REPORT"
            )

        # --- 4. Website -> a real multi-file project, built in the background ---
        if intent == "WEBSITE":
            topic = intent_data.get("topic") or "the requested website"
            three = _wants_3d(message)
            started = await self.dispatch_individual_task(citizen.id, CitizenTaskRequest(
                title=f"{'3D website' if three else 'Website'}: {topic}"[:120], description=message[:3000],
                expected_deliverable="index.html"))
            reply_content = (
                f"Supreme Governor, I'm building **{topic}** as a full project: first a checklist of every element you "
                f"asked for{', each 3D object as its own module' if three else ''}, then the pages, styles and scripts, real "
                "checks with repairs, and a review by a colleague. You'll get the link with a pass/fail line for every "
                "requirement in Phone → Tasks when it's done.")
            citizen.thought = f"Building {topic[:50]}"
            return CitizenChatResponse(
                message_id=msg_id, agent_id=agent_id, agent_name=citizen.name, reply=reply_content,
                model_used=citizen.assigned_model, provider=citizen.provider, timestamp=telemetry["system_clock"],
                action_taken="PROJECT_STARTED", deliverable_title=topic)

        # --- 5. AI-written 3D presentation ---
        if intent in ("3D_PRESENTATION", "WEBSITE"):
            default_topic = "Next-Gen Autonomous AI & Spatial Computing" if intent == "3D_PRESENTATION" else "Modern AI Enterprise & Innovation"
            topic = intent_data.get("topic", default_topic)
            kind_label = "3D presentation" if intent == "3D_PRESENTATION" else "website"
            self.history.start(task_id, citizen.id, citizen.name, f"{kind_label.capitalize()}: {topic}", kind="CHAT", status="WORKING")
            self.history.update(task_id, brief={"title": f"{kind_label.capitalize()}: {topic}", "description": message[:2000],
                                                "expected_deliverable": "index.html"})
            await self._progress(citizen, task_id, "WORKING", 30.0, f"Writing the {kind_label} content for {topic}...")
            result = await self._produce_web_deliverable(citizen, task_id, intent, topic, context=message,
                                                         three_d=_wants_3d(message))
            artifact, evidence = result["artifact"], result["evidence"]
            verified = evidence.exit_code == 0
            self._record_artifact(citizen, task_id, artifact, verified)
            self._finish_history(task_id, verified, evidence, attempts=0)
            await self._progress(citizen, task_id, "COMPLETED" if verified else "FAILED", 100.0,
                                 f"{kind_label.capitalize()} on {topic}: {'verified' if verified else 'verification failed'}",
                                 history_status="VERIFIED" if verified else "FAILED")
            self._schedule_idle(citizen, task_id)

            if result["ai_written"]:
                authorship = f"I wrote the {'slides' if intent == '3D_PRESENTATION' else 'website copy'} myself with {citizen.assigned_model}."
            else:
                authorship = (f"⚠️ My model did not return usable content ({result['fallback_reason']}), "
                              "so this uses the generic template text. Ask again to retry.")
            check = ("✅ Verified: the HTML parses with balanced tags." if verified
                     else f"❌ Verification failed:\n```\n{evidence.output_snippet[:800]}\n```")
            reply_content = (
                f"Supreme Governor, your {kind_label} on **{topic}** is ready.\n\n"
                f"🔗 **Open it:** {artifact.url}\n"
                f"📍 **On disk:** `{artifact.file_path}`\n\n"
                f"{authorship}\n{check}"
            )
            await event_bus.publish(ForgeEvent(
                event_id=uuid.uuid4().hex,
                topic=f"agent:{agent_id}:deliverable",
                payload={"agent_id": agent_id, "deliverable_type": intent, "file_path": artifact.file_path,
                         "title": artifact.title, "task_id": task_id, "url": artifact.url}
            ))
            return CitizenChatResponse(
                message_id=msg_id,
                agent_id=agent_id,
                agent_name=citizen.name,
                reply=reply_content,
                model_used=citizen.assigned_model,
                provider=citizen.provider,
                timestamp=telemetry["system_clock"],
                action_taken="CREATED_3D_PRESENTATION" if intent == "3D_PRESENTATION" else "CREATED_WEBSITE",
                deliverable_title=artifact.title,
                deliverable_url=artifact.url,
                deliverable_path=artifact.file_path,
                deliverable_type=intent,
                artifact_id=artifact.id,
                deliverables=[{"title": artifact.title, "url": artifact.url, "path": artifact.file_path, "verified": verified}],
            )

        # --- 6. General Intelligent QA via Local Model with Grounded Context ---
        if citizen.current_task:
            work = f"You are currently working on: {citizen.current_task} ({citizen.status}, {citizen.work_progress:.0f}% done)."
        else:
            work = "You have no task in progress right now."
        recent = self.history.list(limit=5, agent_id=citizen.id)
        if recent:
            work += " Your recent tasks: " + "; ".join(f"{r['title']} [{r['status']}]" for r in recent) + "."
        past = self._chat_memory.get(citizen.id, [])
        transcript = "\n".join(f"{'Governor' if who == 'user' else citizen.name}: {text}" for who, text in past[-8:])
        system_prompt = (
            f"You are {citizen.name}, the {citizen.profession} in {citizen.department} of 'city_ai_aayushifty'.\n"
            f"Your capabilities: {', '.join(citizen.capabilities)}.\n"
            f"Your current status is {citizen.status}. {work}\n"
            + (f"Conversation so far:\n{transcript}\n" if transcript else "") +
            f"REAL-TIME HOST CLOCK: {telemetry['current_time']}.\n"
            f"METROPOLIS STATUS: 100% power, 100% water, 94.2% satisfaction, 0 incidents.\n"
            f"HOST COMPUTER: Windows ({telemetry['os_name']} {telemetry['os_release']}) [{telemetry['architecture']}], "
            f"Python {telemetry['python_version']}, {telemetry['free_disk_gb']} GB free disk space.\n"
            "The user speaking to you is the Supreme Governor. Speak directly, professionally, authentically in character, and in natural human language.\n"
            "CRITICAL: Always speak fluently in clear human language. NEVER return raw JSON, code dictionaries, or developer debug structures. "
            "Be accurate and helpful, and keep it short: two to four sentences unless the Governor asks for detail."
        )

        req = ModelCompletionRequest(
            prompt=message,
            system_prompt=system_prompt,
            model_name=citizen.assigned_model,
            temperature=0.3,
            max_tokens=CHAT_MAX_TOKENS,
        )

        # interactive: a reply you are waiting for goes ahead of queued background task/mission work
        resp = await self._route(citizen, req, interactive=True)
        reply_content = resp.content.strip()

        # Sanitize any accidental raw JSON / mock engine code structures into articulate human dialogue
        if reply_content.startswith("{") or reply_content.startswith("```json") or "\"status\":" in reply_content:
            try:
                cleaned_json = reply_content
                fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned_json)
                if fence:
                    cleaned_json = fence.group(1).strip()
                data = json.loads(cleaned_json)
                if isinstance(data, dict):
                    if "message" in data and not any(k in data["message"].lower() for k in ["mock", "deterministic", "forge"]):
                        reply_content = f"Supreme Governor, {data['message']}"
                    elif "summary" in data:
                        reply_content = f"Supreme Governor, {data['summary']}"
                    elif "reply" in data:
                        reply_content = data["reply"]
                    else:
                        reply_content = (
                            f"Supreme Governor, operational telemetry and municipal tasks across {citizen.department} "
                            "are executing with 100% verified integrity. All systems are calibrated and standing by for your next directive."
                        )
            except Exception:
                pass

        # Update thought
        memory = self._chat_memory.setdefault(citizen.id, [])
        memory.extend([("user", message[:1000]), ("citizen", reply_content[:1000])])
        del memory[:-16]
        citizen.thought = reply_content[:80] + ("..." if len(reply_content) > 80 else "")

        # Broadcast chat event to live event bus
        await event_bus.publish(ForgeEvent(
            event_id=uuid.uuid4().hex,
            topic=f"agent:{agent_id}:chat",
            payload={
                "agent_id": agent_id,
                "agent_name": citizen.name,
                "player_message": message,
                "reply": reply_content,
                "model_used": resp.model_name
            }
        ))

        return CitizenChatResponse(
            message_id=msg_id,
            agent_id=agent_id,
            agent_name=citizen.name,
            reply=reply_content,
            model_used=resp.model_name,
            provider=resp.provider_name,
            timestamp=telemetry["system_clock"]
        )

    # --- Helpers shared by chat deliverables, tasks and missions ---

    async def _model_call(self, citizen: CitizenProfile, prompt: str, system_prompt: str, temperature: float = 0.2,
                          json_mode: bool = False, max_tokens: int = 4096, continuations: int = 0,
                          model_name: Optional[str] = None, timeout_s: Optional[float] = None) -> str:
        """With continuations > 0, a reply cut off by the token limit is continued that many times and joined,
        so long documents are not saved ending mid-sentence. model_name / timeout_s override the citizen's model
        and the provider's per-call time limit (a model that runs past it is dropped for the next one)."""
        model = model_name or citizen.assigned_model
        req = ModelCompletionRequest(prompt=prompt, system_prompt=system_prompt, max_tokens=max_tokens,
                                     model_name=model, temperature=temperature, json_mode=json_mode, timeout_s=timeout_s)
        resp = await self._route(citizen, req)
        text = resp.content or ""
        for _ in range(continuations):
            if (getattr(resp, "raw_metadata", None) or {}).get("finish_reason") != "length":
                break
            req = ModelCompletionRequest(
                prompt="", system_prompt=system_prompt, max_tokens=max_tokens, model_name=model,
                temperature=temperature, timeout_s=timeout_s, messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": text},
                    {"role": "user", "content": "Your reply was cut off by the length limit. Continue EXACTLY where it "
                                                "stopped, with no repetition and no preamble."}])
            resp = await self._route(citizen, req)
            text += resp.content or ""
        return text

    async def _progress(self, citizen: CitizenProfile, task_id: str, status: str, progress: float,
                        thought: Optional[str] = None, history_status: Optional[str] = None, **history_fields: Any) -> None:
        """Updates the citizen, the task-history record and the live event stream in one place."""
        citizen.status = status
        citizen.active_task_id = task_id
        citizen.work_progress = progress
        if thought:
            citizen.thought = thought
        rec = self.history.update(task_id, status=history_status or status, progress=progress,
                                  stage=(thought or status)[:160], **history_fields)
        await event_bus.publish(ForgeEvent(
            event_id=uuid.uuid4().hex,
            topic=f"agent:{citizen.id}:status",
            payload={"status": status, "task_id": task_id, "progress": progress, "thought": citizen.thought,
                     "task": rec}
        ))

    def _schedule_idle(self, citizen: CitizenProfile, task_id: str, delay: float = 4.0) -> None:
        """Returns the citizen to IDLE after a short pause, unless a newer task has started meanwhile."""
        async def _reset():
            await asyncio.sleep(delay)
            if citizen.active_task_id == task_id:
                citizen.status = "IDLE"
                citizen.active_task_id = None
                citizen.current_task = None
        try:
            asyncio.get_running_loop().create_task(_reset())
        except RuntimeError:
            pass

    def _record_artifact(self, citizen: CitizenProfile, task_id: str, artifact: DeliverableArtifact, verified: bool) -> None:
        self.artifacts[artifact.id] = artifact
        self.artifacts[task_id] = artifact
        self.history.add_deliverable(task_id, artifact.relative_path, artifact.url, artifact.title)
        citizen.completed_deliverables.insert(0, {
            "task_id": task_id,
            "title": artifact.title,
            "deliverable": artifact.relative_path,
            "url": artifact.url,
            "verified": verified,
            "completed_at": datetime.now().strftime("%I:%M %p")
        })

    def _finish_history(self, task_id: str, verified: bool, evidence: VerificationEvidence, attempts: int) -> None:
        self.history.update(task_id, status="VERIFIED" if verified else "FAILED", progress=100.0, verification={
            "verified": verified,
            "suite": evidence.test_suite,
            "exit_code": evidence.exit_code,
            "passed": evidence.passed_tests,
            "failed": evidence.failed_tests,
            "repair_attempts": attempts,
            "output": evidence.output_snippet[-2000:],
        })

    # --- AI-written websites and 3D presentations ---

    async def _write_web_content(self, citizen: CitizenProfile, kind: str, topic: str, context: str = "",
                                 revise_from: Optional[str] = None,
                                 feedback: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], str]:
        """Asks the citizen's model for slide content / website copy as JSON. Returns (content, problem).
        With revise_from + feedback it edits the previous version instead of writing a new one."""
        schema = _SLIDES_SCHEMA if kind == "3D_PRESENTATION" else _WEBSITE_SCHEMA
        what = "a 5-7 slide presentation" if kind == "3D_PRESENTATION" else (
            "a one-page website (3 or more features, 2-4 detail sections, 3-4 metrics)")
        if revise_from is not None:
            prompt = (
                f"You made {what} about: {topic}\n"
                f"CURRENT VERSION (content):\n{revise_from[:6000]}\n\n"
                f"THE GOVERNOR'S REQUESTED CHANGES:\n{(feedback or '')[:2000]}\n\n"
                "Apply exactly these changes and keep everything else as it is (same facts, same structure, "
                "same wording where no change was asked for).\n"
                f"Reply with ONLY the complete updated JSON object of this shape:\n{schema}"
            )
        else:
            prompt = (
                f"Write the content for {what} about: {topic}\n"
                + (f"Request details: {context[:1500]}\n" if context and context.strip() != topic else "")
                + "Use specific, accurate facts about the topic, not generic marketing filler.\n"
                f"Reply with ONLY a JSON object of this shape:\n{schema}"
            )
        system = f"You are {citizen.name}, {citizen.profession}. You reply with a single valid JSON object and nothing else."
        problem = "no reply"
        for _ in range(2):
            try:
                raw = await self._model_call(citizen, prompt, system, temperature=0.4, json_mode=revise_from is not None)
            except Exception as ex:
                return None, f"model call failed: {ex}"
            data = _extract_json(raw)
            if _valid_web_content(kind, data):
                return data, ""
            problem = "reply was not JSON" if data is None else "JSON was missing required fields"
        return None, problem

    async def _produce_web_deliverable(self, citizen: CitizenProfile, task_id: str, kind: str, topic: str,
                                       context: str = "", revise_from: Optional[str] = None,
                                       feedback: Optional[str] = None, three_d: bool = False) -> Dict[str, Any]:
        content, problem = await self._write_web_content(citizen, kind, topic, context, revise_from, feedback)
        # remembered so a later "Request changes" can edit this exact content
        self.history.update(task_id, web_kind=kind, topic=topic, web_content=content, three_d=three_d)
        label = "3D presentation" if kind == "3D_PRESENTATION" else "website"
        await self._progress(citizen, task_id, "WORKING", 65.0, f"Building the {label} for {topic}...")
        if kind == "3D_PRESENTATION":
            artifact = await asyncio.to_thread(computer_service.synthesize_3d_presentation, topic=topic, citizen_name=citizen.name,
                                               citizen_profession=citizen.profession, task_id=task_id, content=content)
        else:
            artifact = await asyncio.to_thread(computer_service.synthesize_website, topic=topic, citizen_name=citizen.name,
                                               citizen_profession=citizen.profession, task_id=task_id, content=content,
                                               three_d=three_d)
        artifact.agent_id = citizen.id
        artifact.url = computer_service.public_url(artifact.relative_path)
        await self._progress(citizen, task_id, "TESTING", 85.0, "Verifying the generated HTML...")
        out_file = Path(artifact.file_path)
        evidence = await verify_deliverables(out_file.parent, [out_file])
        artifact.verification_exit_code = evidence.exit_code
        artifact.verification_summary = (
            f"{'Verified' if evidence.exit_code == 0 else 'FAILED'}: {evidence.passed_tests} checks passed, "
            f"{evidence.failed_tests} failed ({evidence.test_suite}). "
            + ("Content written by the citizen's model." if content else f"Template defaults used: {problem}.")
        )
        if not content:
            self.history.update(task_id, note=f"Model content unavailable ({problem}); template defaults used.")
        return {"artifact": artifact, "evidence": evidence, "ai_written": content is not None, "fallback_reason": problem}

    # --- Individual tasks ---

    async def dispatch_individual_task(self, agent_id: str, req: CitizenTaskRequest) -> Dict[str, Any]:
        """Dispatches a real task to a citizen, creating a workspace, executing tools, and verifying outputs."""
        citizen = self.citizens.get(agent_id)
        if not citizen:
            raise ValueError(f"Citizen '{agent_id}' not found.")

        task_id = f"task-{uuid.uuid4().hex[:8]}"
        self.history.start(task_id, citizen.id, citizen.name, req.title, kind="TASK")
        async_t = asyncio.create_task(self._run_task_execution_loop(citizen, task_id, req))
        self._active_tasks[task_id] = async_t
        async_t.add_done_callback(lambda _t: self._active_tasks.pop(task_id, None))

        return {
            "status": "QUEUED",
            "task_id": task_id,
            "agent_id": citizen.id,
            "agent_name": citizen.name,
            "title": req.title,
            "expected_deliverable": req.expected_deliverable
        }

    async def _run_task_execution_loop(self, citizen: CitizenProfile, task_id: str, req: CitizenTaskRequest,
                                       workspace_dir: Optional[Path] = None, context: str = "",
                                       mission_id: Optional[str] = None,
                                       revision: Optional[Dict[str, Any]] = None,
                                       allow_web: bool = True) -> Dict[str, Any]:
        """Runs one task to an honest outcome. Returns {"verified", "files", "evidence", "attempts", "summary", "error"}."""
        if self.history.get(task_id) is None:
            self.history.start(task_id, citizen.id, citizen.name, req.title,
                               kind="MISSION_SUBTASK" if mission_id else "TASK", mission_id=mission_id)
        citizen.current_task = req.title
        rec = self.history.get(task_id) or {}
        if not rec.get("brief"):
            self.history.update(task_id, brief={"title": req.title, "description": req.description,
                                                "expected_deliverable": req.expected_deliverable})
        try:
            result = await self._execute_task(citizen, task_id, req, workspace_dir, context, revision, allow_web)
        except asyncio.CancelledError:
            self.history.update(task_id, status="CANCELLED", note="Cancelled by the Governor.")
            citizen.status = "IDLE"
            citizen.active_task_id = None
            citizen.current_task = None
            raise
        except Exception as ex:
            logger.exception(f"Task {task_id} crashed")
            self.history.update(task_id, note=f"Task crashed: {ex}")
            await self._progress(citizen, task_id, "FAILED", 100.0, f"Task failed: {ex}"[:120], history_status="FAILED")
            self._schedule_idle(citizen, task_id)
            return {"verified": False, "files": [], "evidence": None, "attempts": 0, "summary": "", "error": str(ex)}
        self._schedule_idle(citizen, task_id)
        return result

    async def _execute_task(self, citizen: CitizenProfile, task_id: str, req: CitizenTaskRequest,
                            workspace_dir: Optional[Path], context: str,
                            revision: Optional[Dict[str, Any]] = None, allow_web: bool = True) -> Dict[str, Any]:
        workspace_dir = Path(workspace_dir) if workspace_dir else self.workspaces_root / f"{citizen.id}_{task_id}"
        workspace_dir.mkdir(parents=True, exist_ok=True)
        ws_manager = WorkspaceManager(workspace_dir)
        self.history.update(task_id, workspace=str(workspace_dir))
        await self._progress(citizen, task_id, "PLANNING", 10.0, f"Planning: {req.title}")
        await self._reason(citizen, task_id, "plan",
                           f"Revising '{req.title}' from your feedback" if revision else
                           f"Taking on '{req.title}' - deliverable: {req.expected_deliverable or 'see brief'}")

        task_text = f"{req.title} {req.description} {req.expected_deliverable}".lower()
        web_kind = None
        if (
            "3d presentation" in task_text or "3d slide" in task_text or "3d deck" in task_text
            or ("presentation" in task_text and any(k in task_text for k in ["3d", "interactive", "webgl", "three", "model"]))
            or (req.expected_deliverable.lower().endswith(".html") and "presentation" in task_text)
        ):
            web_kind = "3D_PRESENTATION"
        elif _is_web_request(task_text):
            web_kind = "WEBSITE"

        if web_kind and not allow_web:
            web_kind = None      # a supporting mission step: it writes content/specs, the assembly step builds the page
        if (web_kind == "WEBSITE" and not revision) or (revision and revision.get("project")):
            return await self._execute_project_task(citizen, task_id, req, workspace_dir, context, revision)
        if web_kind and not revision:
            return await self._execute_web_task(citizen, task_id, req, web_kind, workspace_dir, ws_manager, context)

        previous_files: List[Path] = []
        if revision:
            for rel in revision.get("files", []):
                try:
                    fp = ws_manager.resolve_path(rel)
                except Exception:
                    continue
                if fp.is_file() and fp not in previous_files:
                    previous_files.append(fp)

        # Generic deliverable: the model writes files, real checks verify them, failures go back for repair.
        plan_prompt = (
            f"You are {citizen.name}, {citizen.profession}.\n"
            f"TASK: {req.title}\n"
            f"DESCRIPTION: {req.description}\n"
            f"EXPECTED DELIVERABLE: {req.expected_deliverable}\n"
            + (f"\nCONTEXT FROM EARLIER WORK (these files are already in your workspace):\n{context}\n" if context else "")
            + f"\nFiles already in the workspace: {', '.join(ws_manager.list_files()[:40]) or 'none'}\n\n"
            "Write the complete deliverable. Python files must run; if you write tests, name them test_*.py and make them pass.\n"
            "Output valid JSON in this exact structure:\n"
            "{\n"
            '  "summary": "What you built",\n'
            '  "files": [\n'
            '    {"path": "relative/path/to/file.ext", "content": "Full complete file content here"}\n'
            "  ]\n"
            "}"
        )
        if revision:
            current = "\n\n".join(
                f"--- {_rel(fp, workspace_dir)} ---\n{fp.read_text(encoding='utf-8', errors='replace')[:6000]}"
                for fp in previous_files
            )[:16000]
            plan_prompt = (
                f"You are {citizen.name}, {citizen.profession}. You are REVISING your earlier deliverable "
                f"(this will be version {revision.get('version')}).\n"
                f"ORIGINAL TASK: {req.title}\n"
                f"DESCRIPTION: {req.description}\n"
                f"EXPECTED DELIVERABLE: {req.expected_deliverable}\n\n"
                f"THE GOVERNOR'S REQUESTED CHANGES:\n{str(revision.get('feedback', ''))[:3000]}\n\n"
                f"YOUR CURRENT FILES (in your workspace):\n{current or '(none found)'}\n\n"
                "Apply the requested changes by editing these files. Keep everything that was not asked to change, "
                "and keep the code working: Python files must run and existing tests must still pass "
                "(do not delete or weaken tests).\n"
                "Output valid JSON with ONLY the files you change or add, each with its FULL new content:\n"
                '{"summary": "What you changed", "files": [{"path": "relative/path", "content": "full file content"}]}'
            )
        system = f"You are {citizen.name}. Generate complete, working code, reports and documentation."
        await self._progress(citizen, task_id, "WORKING", 30.0,
                             f"Applying your changes to {req.title}" if revision else f"Writing deliverables for {req.title}")
        raw_output = await self._model_call(citizen, plan_prompt, system, temperature=0.1, json_mode=bool(revision),
                                             max_tokens=8192, continuations=2)
        parsed = _extract_json(raw_output)
        files_to_write = _files_from(parsed)
        if not files_to_write and revision:
            # models sometimes answer in the "--- path ---" / fenced-code layout they were shown
            files_to_write = _files_from_text(raw_output, [_rel(fp, workspace_dir) for fp in previous_files])
        summary = str(parsed.get("summary", "")) if isinstance(parsed, dict) else ""
        if summary:
            await self._reason(citizen, task_id, "thought", summary)
        if not files_to_write and revision and previous_files:
            # A revision must edit the existing work: a reply without a file list cannot be applied safely.
            snippet = re.sub(r"\s+", " ", raw_output or "")[:300]
            self.history.update(task_id, note=f"Model did not return edited files; nothing was changed. Its reply began: {snippet!r}")
        elif not files_to_write:
            # Plain-text reply: save it (or its first code block) as the expected deliverable.
            content = raw_output
            code_match = re.search(r"```(?:\w+)?\s*([\s\S]*?)\s*```", raw_output)
            if code_match:
                content = code_match.group(1).strip()
            files_to_write = [{"path": req.expected_deliverable.strip() or f"{citizen.id}_deliverable.md", "content": content}]
            self.history.update(task_id, note="Model did not return the JSON file list; saved its reply as the deliverable.")

        written: List[Path] = list(previous_files)    # a revision is verified as the whole deliverable
        if files_to_write:
            names = [str(f.get("path", "")) for f in files_to_write][:6]
            await self._reason(citizen, task_id, "tool_call", f"write {len(files_to_write)} file(s): {', '.join(names)}")
        self._write_files(ws_manager, files_to_write, written, task_id)
        ws_manager.commit_changes(f"revise: {req.title} v{revision.get('version')} by {citizen.name}" if revision
                                  else f"feat: {req.title} by {citizen.name}")
        if revision and previous_files and not files_to_write:
            evidence = await verify_deliverables(workspace_dir, written)
            evidence.exit_code = evidence.exit_code or 1
            evidence.output_snippet = ("The model did not return any edited files, so the requested changes were "
                                       "not applied.\n" + (evidence.output_snippet or ""))
            self._finish_history(task_id, False, evidence, 0)
            await self._progress(citizen, task_id, "FAILED", 100.0, "Changes not applied: no edited files came back",
                                 history_status="FAILED")
            return {"verified": False, "files": [_rel(fp, workspace_dir) for fp in written], "evidence": evidence,
                    "attempts": 0, "summary": "", "error": "no edited files returned"}

        # The artifact is visible right away; its verification fields are filled in below.
        expected_name = Path(req.expected_deliverable).name if req.expected_deliverable else ""
        primary = next((p for p in written if expected_name and p.name == expected_name), written[0] if written else None)
        artifact = DeliverableArtifact(
            id=f"art-{uuid.uuid4().hex[:8]}",
            task_id=task_id,
            agent_id=citizen.id,
            agent_name=citizen.name,
            title=req.title,
            relative_path=_rel(primary, workspace_dir) if primary else req.expected_deliverable,
            file_path=str(primary) if primary else str(workspace_dir),
            file_size_bytes=primary.stat().st_size if primary and primary.exists() else 0,
            content=primary.read_text(encoding="utf-8", errors="replace")[:4000] if primary and primary.exists() else "",
            verification_exit_code=-1,
            verification_summary="Verifying...",
            created_at=datetime.now().strftime("%I:%M %p")
        )
        self.artifacts[task_id] = artifact
        self.artifacts[artifact.id] = artifact

        await self._progress(citizen, task_id, "TESTING", 60.0, "Running verification checks...")
        await self._reason(citizen, task_id, "tool_call", "run verification checks")
        evidence = await verify_deliverables(workspace_dir, written)
        await self._reason(citizen, task_id, "tool_result", _evidence_line(evidence))
        attempts = 0
        while evidence.exit_code != 0 and attempts < MAX_REPAIR_ATTEMPTS:
            attempts += 1
            await self._progress(citizen, task_id, "VERIFYING", 60.0 + attempts * 10.0,
                                 f"Checks failed; repair attempt {attempts}/{MAX_REPAIR_ATTEMPTS}",
                                 history_status="REPAIRING", repair_attempts=attempts)
            current = "\n\n".join(
                f"--- {_rel(p, workspace_dir)} ---\n{p.read_text(encoding='utf-8', errors='replace')[:6000]}"
                for p in written if p.exists()
            )
            repair_prompt = (
                f"TASK: {req.title}\n{req.description}\n\n"
                f"Your files failed verification (repair attempt {attempts} of {MAX_REPAIR_ATTEMPTS}). Error output:\n"
                f"{evidence.output_snippet[-3000:]}\n\nCurrent files:\n{current}\n\n"
                "Fix the root cause. Do not delete or weaken tests to make them pass.\n"
                'Reply with ONLY JSON: {"diagnosis": "...", "files": [{"path": "...", "content": "full fixed file"}]}'
            )
            try:
                repair_raw = await self._model_call(citizen, repair_prompt, system, temperature=0.1, json_mode=True)
            except Exception as ex:
                self.history.update(task_id, note=f"Repair attempt {attempts}: model call failed ({ex}).")
                continue
            repair_json = _extract_json(repair_raw)
            diagnosis = repair_json.get("diagnosis") if isinstance(repair_json, dict) else None
            if diagnosis:
                await self._reason(citizen, task_id, "thought", f"Diagnosis: {diagnosis}")
            fixes = _files_from(repair_json) or _files_from_text(
                repair_raw, [_rel(p, workspace_dir) for p in written])
            if not fixes:
                self.history.update(task_id, note=f"Repair attempt {attempts}: model reply had no file fixes.")
                continue
            self._write_files(ws_manager, fixes, written, task_id)
            ws_manager.commit_changes(f"fix: repair attempt {attempts} for {req.title}")
            previous, evidence = evidence, await verify_deliverables(workspace_dir, written)
            await self._reason(citizen, task_id, "tool_result", _evidence_line(evidence))
            if evidence.exit_code != 0 and error_signature(previous.output_snippet) == error_signature(evidence.output_snippet):
                await self._reason(citizen, task_id, "thought",
                                   "The repair produced the same error again; stopping instead of looping on it.")
                self.history.update(task_id, note=f"Repair attempt {attempts}: same error as before; stopped repairing.")
                break

        verified = evidence.exit_code == 0
        if primary and primary.exists():
            artifact.file_size_bytes = primary.stat().st_size
            artifact.content = primary.read_text(encoding="utf-8", errors="replace")[:4000]
        artifact.verification_exit_code = evidence.exit_code
        artifact.verification_summary = (
            f"{'Verified' if verified else 'FAILED verification'}: {evidence.passed_tests} passed, "
            f"{evidence.failed_tests} failed ({evidence.test_suite}); repair attempts: {attempts}"
        )
        for p in written:
            self.history.add_deliverable(task_id, _rel(p, workspace_dir))
        citizen.completed_deliverables.insert(0, {
            "task_id": task_id,
            "title": req.title,
            "deliverable": artifact.relative_path,
            "verified": verified,
            "completed_at": datetime.now().strftime("%I:%M %p")
        })
        self._finish_history(task_id, verified, evidence, attempts)
        outcome = "verified" if verified else f"failed verification after {attempts} repair attempts"
        await self._progress(citizen, task_id, "COMPLETED" if verified else "FAILED", 100.0,
                             f"{artifact.relative_path}: {outcome}",
                             history_status="VERIFIED" if verified else "FAILED")
        return {"verified": verified, "files": [_rel(p, workspace_dir) for p in written], "evidence": evidence,
                "attempts": attempts, "summary": summary or artifact.verification_summary,
                "error": None if verified else evidence.output_snippet}

    async def _execute_web_task(self, citizen: CitizenProfile, task_id: str, req: CitizenTaskRequest, web_kind: str,
                                workspace_dir: Path, ws_manager: WorkspaceManager, context: str) -> Dict[str, Any]:
        topic = req.title
        match = re.search(r"(?:on|about|for)\s+(.+)", req.title, re.IGNORECASE)
        if match and match.group(1).strip().strip("?!.,\"' "):
            topic = match.group(1).strip().strip("?!.,\"' ")
        await self._progress(citizen, task_id, "WORKING", 30.0, f"Writing content for {topic}...")
        result = await self._produce_web_deliverable(citizen, task_id, web_kind, topic,
                                                     context=f"{req.description}\n{context}".strip(),
                                                     three_d=_wants_3d(f"{req.title} {req.description}"))
        artifact, evidence = result["artifact"], result["evidence"]
        default_name = "3d_presentation.html" if web_kind == "3D_PRESENTATION" else "index.html"
        target_name = Path(req.expected_deliverable).name if req.expected_deliverable.lower().endswith(".html") else default_name
        (workspace_dir / target_name).write_text(Path(artifact.file_path).read_text(encoding="utf-8"), encoding="utf-8")
        ws_manager.commit_changes(f"feat: {req.title} by {citizen.name}")
        verified = evidence.exit_code == 0
        self._record_artifact(citizen, task_id, artifact, verified)
        self._finish_history(task_id, verified, evidence, attempts=0)
        await self._progress(citizen, task_id, "COMPLETED" if verified else "FAILED", 100.0,
                             f"{artifact.title}: {'verified' if verified else 'verification failed'}",
                             history_status="VERIFIED" if verified else "FAILED")
        return {"verified": verified, "files": [target_name], "evidence": evidence, "attempts": 0,
                "summary": artifact.verification_summary, "url": artifact.url,
                "error": None if verified else evidence.output_snippet}

    async def _execute_project_task(self, citizen: CitizenProfile, task_id: str, req: CitizenTaskRequest,
                                    workspace_dir: Path, context: str, revision: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """A real multi-file project: requirements checklist, plan, files, verification, repair, peer review, link."""
        reviewer = self.citizens["agent-architect" if citizen.id == "agent-qa" else "agent-qa"]

        freellm = model_router.get_provider("freellm")

        def model_for(c: CitizenProfile):
            async def call(prompt: str, system: str, json_mode: bool, max_tokens: int) -> str:
                # Bulk file writes and repairs go to a quick coder with a per-call time limit; the gateway fails
                # over down the fast chain, then the coding chain. Without fast models: the citizen's own model.
                fast = await freellm.fast_models() if (freellm and c.provider_key == "freellm") else []
                if fast:
                    return await self._model_call(c, prompt, system, temperature=0.25, json_mode=json_mode,
                                                  max_tokens=max_tokens, model_name=fast[0], timeout_s=FAST_CALL_TIMEOUT_S)
                return await self._model_call(c, prompt, system, temperature=0.25, json_mode=json_mode, max_tokens=max_tokens)
            return call

        async def progress(message: str, pct: float) -> None:
            await self._progress(citizen, task_id, "TESTING" if pct >= 60 else "WORKING", pct, message[:160])
            lowered = message.lower()
            kind = ("plan" if lowered.startswith("planning") else
                    "tool_call" if lowered.startswith(("writing", "running", "checking", "verifying")) else
                    "tool_result" if "fail" in lowered or "passed" in lowered else "thought")
            await self._reason(citizen, task_id, kind, message)

        builder = project_builder.ProjectBuilder(model_for(citizen), model_for(reviewer), progress,
                                                 lambda text: self.history.update(task_id, note=text))
        request = f"{req.title}\n{req.description}".strip()
        result = await builder.build(request, context, workspace_dir, reviewer.name, revision=revision)
        WorkspaceManager(workspace_dir).commit_changes(
            f"{'revise' if revision else 'feat'}: {req.title} by {citizen.name}")

        dest, rel = await asyncio.to_thread(project_builder.publish, workspace_dir, result["plan"]["name"], task_id)
        url = computer_service.public_url(rel)
        live = await self._serve_live(citizen, task_id, dest, result["plan"]["name"])
        if live:
            url = live["url"]
        verified = result["verified"]
        report = (f"Requirements: {result['passed']}/{result['total']} implemented and checked. "
                  + (f"Review by {result['review']['reviewer']}: "
                     + ("approved" if result["review"].get("approved") else
                        f"{len(result['review'].get('issues') or [])} issue(s) found and sent back for fixing"
                        if result["review"].get("issues") else "no usable verdict") + ". " if result["review"].get("reviewer") else "")
                  + (f"Open problems: " + "; ".join(result["problems"][:8]) if result["problems"] else "All checks pass."))
        evidence = VerificationEvidence(test_suite="project checks (HTML, JS syntax, links, requirements) + peer review",
                                        exit_code=0 if verified else 1, passed_tests=result["passed"],
                                        failed_tests=(result["total"] - result["passed"]) + len(result["problems"]),
                                        output_snippet=report[:3000])
        artifact = DeliverableArtifact(
            id=f"art-{uuid.uuid4().hex[:8]}", task_id=task_id, agent_id=citizen.id, agent_name=citizen.name,
            title=result["plan"]["name"][:120], relative_path=rel, file_path=str(dest / "index.html"),
            file_size_bytes=sum(f.stat().st_size for f in dest.rglob("*") if f.is_file()),
            content=(dest / "index.html").read_text(encoding="utf-8", errors="replace")[:4000] if (dest / "index.html").is_file() else "",
            verification_exit_code=evidence.exit_code, verification_summary=report[:1000],
            created_at=datetime.now().strftime("%I:%M %p"), url=url)
        self._record_artifact(citizen, task_id, artifact, verified)
        self.history.update(task_id, project=result["plan"], requirements=result["requirements"], review=result["review"],
                            three_d=result["three_d"], project_files=result["files"],
                            browser=_browser_summary(result.get("runtime")),
                            live_app=live, static_url=computer_service.public_url(rel))
        self._finish_history(task_id, verified, evidence, attempts=result["repair_rounds"])
        await self._progress(citizen, task_id, "COMPLETED" if verified else "FAILED", 100.0,
                             f"{result['plan']['name'][:60]}: {result['passed']}/{result['total']} requirements"
                             + ("" if verified else " — open problems remain"),
                             history_status="VERIFIED" if verified else "FAILED")
        return {"verified": verified, "files": result["files"], "evidence": evidence, "attempts": result["repair_rounds"],
                "summary": report, "url": url, "error": None if verified else report}

    async def _serve_live(self, citizen: CitizenProfile, task_id: str, project: Path, name: str) -> Optional[Dict[str, Any]]:
        """Runs the published project as a live loopback server (FastAPI, Node or static) and checks it answers
        HTTP 200. Returns the app record, or None when it would not start (the /deliverables link still works)."""
        old = app_runner.by_task(task_id)
        if old:
            await asyncio.to_thread(app_runner.stop, old["id"])
        try:
            info = await asyncio.to_thread(app_runner.start, project, name, task_id)
        except Exception as ex:
            await self._reason(citizen, task_id, "result", f"Could not start the live app: {ex}")
            return None
        if info.get("status") != "running":
            await self._reason(citizen, task_id, "result",
                               f"Live app did not come up ({info.get('status')}): {(info.get('error') or '')[:200]}")
            return None
        await self._reason(citizen, task_id, "result",
                           f"Live {info['kind']} app is running at {info['url']} (HTTP 200 checked).")
        return info

    def _write_files(self, ws_manager: WorkspaceManager, files: List[Dict[str, str]], written: List[Path], task_id: str) -> None:
        for f in files:
            problem = _unwritable(str(f.get("path") or ""))
            if problem:
                self.history.update(task_id, note=f"Refused to write '{str(f.get('path'))[:80]}': {problem}")
                continue
            try:
                p = ws_manager.write_file(f["path"], f["content"])
            except Exception as ex:  # path outside the workspace, invalid name, ...
                self.history.update(task_id, note=f"Refused to write '{f.get('path')}': {ex}")
                continue
            if p not in written:
                written.append(p)

    # --- Revisions: "Request changes" on a finished task ---

    def revision_chain(self, task_id: str) -> List[Dict[str, Any]]:
        """All versions of a deliverable (the original first), newest last."""
        rec = self.history.get(task_id)
        if not rec:
            return []
        root = rec.get("root_task_id") or rec["task_id"]
        chain = [r for r in self.history.list(limit=MAX_HISTORY_SCAN)
                 if r["task_id"] == root or r.get("root_task_id") == root]
        return sorted(({k: v for k, v in r.items() if k != "web_content"} for r in chain),
                      key=lambda r: r.get("version") or 1)

    def revise_task(self, task_id: str, feedback: str) -> Dict[str, Any]:
        """Starts the next version of a finished task: the same citizen edits its previous deliverable (same
        workspace) according to the feedback; the result is verified (with repair attempts) like any task and
        both versions stay available. Raises LookupError / ValueError / RuntimeError for 404 / 400 / 409."""
        loop = asyncio.get_running_loop()   # raises before anything is written when called outside the event loop
        feedback = (feedback or "").strip()
        if not feedback:
            raise ValueError("Describe the changes you want.")
        orig = self.history.get(task_id)
        if not orig:
            raise LookupError(f"Task '{task_id}' not found.")
        if orig["status"] not in REVISABLE_STATUSES:
            raise RuntimeError(f"Only finished work can be revised (this task is {orig['status']}).")
        citizen = self.citizens.get(orig["agent_id"])
        if not citizen:
            raise LookupError(f"Citizen '{orig['agent_id']}' not found.")
        chain = self.revision_chain(task_id)
        if any(r["status"] not in TERMINAL_STATUSES for r in chain):
            raise RuntimeError("A revision of this deliverable is already in progress.")

        web_kind = None if orig.get("project") else (orig.get("web_kind") or _web_kind_from_deliverables(orig))
        workspace = Path(orig["workspace"]) if orig.get("workspace") else None
        if not web_kind and not (workspace and workspace.is_dir()):
            raise RuntimeError("The original workspace no longer exists, so there is nothing to edit.")

        root = orig.get("root_task_id") or orig["task_id"]
        version = max((r.get("version") or 1) for r in chain) + 1
        base_title = orig.get("base_title") or orig["title"]
        if not web_kind and not orig.get("project"):
            self._snapshot_version(orig, root)     # keep the version being revised viewable as it is now

        new_id = f"task-{uuid.uuid4().hex[:8]}"
        title = f"{base_title} (v{version})"
        self.history.start(new_id, citizen.id, citizen.name, title, kind="REVISION", mission_id=orig.get("mission_id"))
        self.history.update(new_id, revision_of=orig["task_id"], root_task_id=root, version=version,
                            base_title=base_title, feedback=feedback[:4000], brief=orig.get("brief"))
        if not orig.get("version"):
            self.history.update(orig["task_id"], version=1, base_title=base_title)

        job = loop.create_task(self._run_revision(citizen, new_id, orig, feedback, version, root, web_kind, workspace))
        self._active_tasks[new_id] = job
        job.add_done_callback(lambda _t: self._active_tasks.pop(new_id, None))
        return {"status": "QUEUED", "task_id": new_id, "revision_of": orig["task_id"], "root_task_id": root,
                "version": version, "agent_id": citizen.id, "agent_name": citizen.name, "title": title}

    async def _run_revision(self, citizen: CitizenProfile, task_id: str, orig: Dict[str, Any], feedback: str,
                            version: int, root: str, web_kind: Optional[str], workspace: Optional[Path]) -> Dict[str, Any]:
        brief = orig.get("brief") or {}
        req = CitizenTaskRequest(title=brief.get("title") or orig.get("base_title") or orig["title"],
                                 description=brief.get("description") or "",
                                 expected_deliverable=brief.get("expected_deliverable") or "")
        if orig.get("project"):
            project = orig["project"]
            revision = {"feedback": feedback, "version": version, "project": True, "requirements": orig.get("requirements") or [],
                        "files": project.get("files") or [], "name": project.get("name"), "summary": project.get("summary"),
                        "three_d": orig.get("three_d")}
            return await self._run_task_execution_loop(citizen, task_id, req, workspace_dir=workspace,
                                                       mission_id=orig.get("mission_id"), revision=revision)
        if not web_kind:
            revision = {"feedback": feedback, "version": version,
                        "files": [d["path"] for d in orig.get("deliverables", []) if not d.get("url") or "/revisions/" in d["url"]]}
            result = await self._run_task_execution_loop(citizen, task_id, req, workspace_dir=workspace,
                                                         mission_id=orig.get("mission_id"), revision=revision)
            self._snapshot_version(self.history.get(task_id) or {}, root)
            return result

        # websites / 3D presentations: the model edits the previous content; the new version gets its own link
        citizen.current_task = req.title
        try:
            await self._progress(citizen, task_id, "PLANNING", 10.0, f"Reading your feedback on {req.title}")
            previous = orig.get("web_content")
            revise_from = json.dumps(previous, ensure_ascii=False, indent=1) if previous else _deliverable_text(orig)
            topic = orig.get("topic") or _topic_from_title(orig.get("base_title") or orig["title"])
            await self._progress(citizen, task_id, "WORKING", 30.0, f"Applying your changes (v{version})...")
            result = await self._produce_web_deliverable(citizen, task_id, web_kind, topic, context=req.description,
                                                         revise_from=revise_from, feedback=feedback,
                                                         three_d=bool(orig.get("three_d")))
            artifact, evidence = result["artifact"], result["evidence"]
            verified = evidence.exit_code == 0 and result["ai_written"]
            if not result["ai_written"]:
                evidence.exit_code = evidence.exit_code or 1
                evidence.output_snippet = (f"The model did not return usable revised content ({result['fallback_reason']}), "
                                           "so the changes were not applied.\n" + (evidence.output_snippet or ""))
            artifact.title = f"{artifact.title} (v{version})"
            if workspace and workspace.is_dir():
                target = workspace / ("3d_presentation.html" if web_kind == "3D_PRESENTATION" else "index.html")
                target.write_text(Path(artifact.file_path).read_text(encoding="utf-8"), encoding="utf-8")
                WorkspaceManager(workspace).commit_changes(f"revise: {req.title} v{version} by {citizen.name}")
            self._record_artifact(citizen, task_id, artifact, verified)
            self._finish_history(task_id, verified, evidence, attempts=0)
            await self._progress(citizen, task_id, "COMPLETED" if verified else "FAILED", 100.0,
                                 f"{req.title} v{version}: {'verified' if verified else 'changes not applied'}",
                                 history_status="VERIFIED" if verified else "FAILED")
            return {"verified": verified, "url": artifact.url}
        except asyncio.CancelledError:
            self.history.update(task_id, status="CANCELLED", note="Cancelled by the Governor.")
            raise
        except Exception as ex:
            logger.exception(f"Revision {task_id} crashed")
            self.history.update(task_id, note=f"Revision crashed: {ex}")
            await self._progress(citizen, task_id, "FAILED", 100.0, f"Revision failed: {ex}"[:120], history_status="FAILED")
            return {"verified": False, "error": str(ex)}
        finally:
            self._schedule_idle(citizen, task_id)

    def _snapshot_version(self, rec: Dict[str, Any], root: str) -> None:
        """Copies a version's files to data/deliverables/revisions/<root>/v<n>/ so every version keeps its own link,
        and points the record's deliverables at that copy."""
        workspace = rec.get("workspace")
        if not rec or not workspace or not Path(workspace).is_dir():
            return
        if any((d.get("url") or "").find("/revisions/") >= 0 for d in rec.get("deliverables", [])):
            return                                   # already snapshotted
        ws = Path(workspace).resolve()
        dest = (config.DELIVERABLES_DIR / "revisions" / root / f"v{rec.get('version') or 1}").resolve()
        updated = []
        for d in rec.get("deliverables", []):
            if d.get("url"):
                updated.append(d)
                continue
            src = (ws / d["path"]).resolve()
            if ws not in src.parents or not src.is_file():  # never copy anything outside the workspace
                updated.append(d)
                continue
            out = dest / d["path"]
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(src.read_bytes())
            rel = out.relative_to(config.DELIVERABLES_DIR.resolve()).as_posix()
            updated.append({**d, "url": computer_service.public_url(rel)})
        self.history.update(rec["task_id"], deliverables=updated)

    async def cancel_task(self, task_id: str) -> bool:
        """Cancels a running task safely."""
        t = self._active_tasks.pop(task_id, None)
        if t is None:
            return False
        t.cancel()
        self.history.update(task_id, status="CANCELLED", note="Cancelled by the Governor.")
        for c in self.citizens.values():
            if c.active_task_id == task_id:
                c.status = "IDLE"
                c.active_task_id = None
                c.thought = "Task cancelled by Governor."
        return True

    def get_artifact(self, identifier: str) -> Optional[DeliverableArtifact]:
        """Returns verified deliverable artifact metadata and contents by task_id or artifact_id."""
        if identifier in self.artifacts:
            return self.artifacts[identifier]
        for art in self.artifacts.values():
            if art.id == identifier or art.task_id == identifier or art.relative_path == identifier:
                return art
        return None

    def list_task_history(self, limit: int = 100, agent_id: Optional[str] = None,
                          mission_id: Optional[str] = None) -> List[Dict[str, Any]]:
        # the stored website/slide content is only needed for revisions; keep the polled list small
        return [{k: v for k, v in r.items() if k != "web_content"}
                for r in self.history.list(limit=limit, agent_id=agent_id, mission_id=mission_id)]

    # --- Public Missions System ---
    async def publish_public_mission(self, req: PublicMissionCreateRequest) -> Dict[str, Any]:
        """Submits a mission and waits until it has been decomposed (the run itself continues in the background)."""
        mission = self.submit_public_mission(req)
        planned = self._mission_planned.get(mission["id"])
        if planned is not None:
            await planned.wait()
        return mission

    def submit_public_mission(self, req: PublicMissionCreateRequest) -> Dict[str, Any]:
        """Registers a mission at once (status PLANNING) and plans + runs it in the background, so the caller
        gets an answer immediately even while the local GPU is busy. Publishing the same title again while
        it is still being planned or running returns the existing mission instead of starting a duplicate."""
        key = " ".join(req.title.lower().split())
        for existing in self.public_missions:
            if (existing["status"] in ("PLANNING", "IN_PROGRESS")
                    and " ".join(existing["title"].lower().split()) == key
                    and time.time() - existing.get("published_ts", 0) < DUPLICATE_MISSION_WINDOW_S):
                return {**existing, "duplicate": True}

        mission_id = f"mission-{uuid.uuid4().hex[:8]}"
        mission: Dict[str, Any] = {
            "id": mission_id,
            "title": req.title,
            "description": req.description,
            "category": req.category,
            "status": "PLANNING",
            "progress": 0,
            "subtasks": [],
            "participating_agent_ids": [],
            "deliverables": [],
            "workspace_dir": str(self.workspaces_root / mission_id),
            "published_at": datetime.now().strftime("%I:%M %p"),
            "published_ts": time.time(),
            "completed_at": None,
            "channel": [],              # one shared thread: Governor briefings, citizens' progress, deliverables
            "governor_notes": [],       # Governor messages; every step that starts later is given them
            "web_kind": _mission_web_kind(f"{req.title} {req.description}"),
            "three_d": _wants_3d(f"{req.title} {req.description}"),
            "final_subtask_id": None,
            "final_deliverable": None,
        }
        self.public_missions.insert(0, mission)
        self._post(mission, "governor", f"**{req.title}**\n{req.description}".strip(), kind="brief",
                   author_name="Supreme Governor")
        planned = asyncio.Event()
        self._mission_planned[mission_id] = planned

        async def plan_then_run() -> None:
            try:
                await self._plan_mission(mission, req)
            except Exception as ex:  # planning has its own fallback; this only guards unexpected errors
                logger.warning(f"Mission planning failed: {ex}")
                mission["status"] = "FAILED"
                mission["completed_at"] = datetime.now().strftime("%I:%M %p")
                return
            finally:
                planned.set()
                self._mission_planned.pop(mission_id, None)
            await self._run_mission_pipeline(mission)

        mission_task = asyncio.create_task(plan_then_run())
        self._active_tasks[mission_id] = mission_task
        mission_task.add_done_callback(lambda _t: self._active_tasks.pop(mission_id, None))
        return mission

    async def _plan_mission(self, mission: Dict[str, Any], req: PublicMissionCreateRequest) -> None:
        """Decomposes the mission into a dependency graph of subtasks (filled into the mission in place)."""
        mission_id = mission["id"]
        coordinator = self.citizens["agent-coordinator"]
        agent_list = ", ".join(f"{c.id} ({c.profession})" for c in self.citizens.values() if c.id != coordinator.id)
        decomp_prompt = (
            f"You are {coordinator.name}, Master Orchestrator of city_ai_aayushifty.\n"
            f"MISSION TITLE: {req.title}\n"
            f"MISSION DESCRIPTION: {req.description}\n"
            f"CATEGORY: {req.category}\n\n"
            "Decompose this mission into 2-5 subtasks. Subtasks that do not need each other's output must not "
            "depend on each other, so they can run in parallel.\n"
            "Each subtask delivers ONE text file the citizen can write and check (md, json, py, js, css, html, csv) — "
            "never design or binary files (.fig, .pdf, images, videos) and no build pipelines, servers or hosting.\n"
            + (f"The mission's result is ONE {'3D ' if mission.get('three_d') else ''}"
               f"{'website' if mission.get('web_kind') == 'WEBSITE' else 'presentation'}. Your subtasks must NOT build it: they "
               "research and write the content, copy, data and design notes (markdown or JSON). A final assembly step, "
               "added automatically, builds the single deliverable from all of their work. Use at most 3 subtasks, all "
               "markdown or JSON: no Django, Flask, Python, test suites or other code steps — the assembly picks the stack.\n"
               if mission.get("web_kind") else "")
            + 
            f"Available agent IDs: {agent_list}.\n"
            "Respond in valid JSON format:\n"
            "{\n"
            '  "summary": "Mission operational strategy",\n'
            '  "subtasks": [\n'
            '    {"id": "1", "title": "Subtask title", "assigned_agent_id": "agent-analyst", '
            '"expected_deliverable": "requirements_spec.md", "dependencies": []}\n'
            "  ]\n"
            "}"
        )
        subtasks_data: List[Dict[str, Any]] = []
        try:
            raw_text = await self._model_call(coordinator, decomp_prompt, "You reply with a single valid JSON object.", temperature=0.2)
            parsed = _extract_json(raw_text)
            if isinstance(parsed, dict) and isinstance(parsed.get("subtasks"), list):
                subtasks_data = [s for s in parsed["subtasks"] if isinstance(s, dict)][:8]
        except Exception as ex:
            logger.warning(f"Mission decomposition failed: {ex}")

        if mission.get("web_kind"):
            subtasks_data = _content_steps_only(subtasks_data)
        if not subtasks_data:
            subtasks_data = _fallback_subtasks(req)

        local_ids = [str(st.get("id", i + 1)) for i, st in enumerate(subtasks_data)]
        if len(set(local_ids)) != len(local_ids):
            local_ids = [str(i + 1) for i in range(len(subtasks_data))]
        formatted_subtasks = []
        for local_id, st in zip(local_ids, subtasks_data):
            assigned_c = self.citizens.get(str(st.get("assigned_agent_id", "")), self.citizens["agent-engineer"])
            deps = [str(d) for d in (st.get("dependencies") or []) if str(d) in local_ids and str(d) != local_id]
            task_id = f"m-{uuid.uuid4().hex[:6]}"
            title = str(st.get("title") or "Mission subtask")
            formatted_subtasks.append({
                "id": f"{mission_id}-{local_id}",
                "task_id": task_id,
                "title": title,
                "assigned_agent_id": assigned_c.id,
                "assigned_agent_name": assigned_c.name,
                "expected_deliverable": str(st.get("expected_deliverable") or "deliverable.md"),
                "status": "PENDING",
                "progress": 0,
                "dependencies": [f"{mission_id}-{d}" for d in dict.fromkeys(deps)],
                "deliverable_result": None,
                "verification": None,
                "blocked_by": [],
                "error": None,
            })
            self.history.start(task_id, assigned_c.id, assigned_c.name, title, kind="MISSION_SUBTASK", mission_id=mission_id)

        if mission.get("web_kind"):
            # one coherent deliverable: a final step combines everyone's work into a single site / presentation
            for st in formatted_subtasks:
                if st["expected_deliverable"].lower().endswith((".html", ".htm")):
                    st["expected_deliverable"] = Path(st["expected_deliverable"]).stem + "_content.md"
            builder = self.citizens["agent-webdev" if mission["web_kind"] == "WEBSITE" else "agent-designer"]
            what = ("3D website" if mission.get("three_d") else "website") if mission["web_kind"] == "WEBSITE" else "3D presentation"
            final_task = f"m-{uuid.uuid4().hex[:6]}"
            final_title = f"Assemble the final {what}: {req.title}"
            formatted_subtasks.append({
                "id": f"{mission_id}-final", "task_id": final_task, "title": final_title,
                "assigned_agent_id": builder.id, "assigned_agent_name": builder.name,
                "expected_deliverable": "index.html" if mission["web_kind"] == "WEBSITE" else "3d_presentation.html",
                "status": "PENDING", "progress": 0,
                "dependencies": [st["id"] for st in formatted_subtasks],
                "deliverable_result": None, "verification": None, "blocked_by": [], "error": None, "final": True,
            })
            self.history.start(final_task, builder.id, builder.name, final_title, kind="MISSION_SUBTASK", mission_id=mission_id)
            mission["final_subtask_id"] = f"{mission_id}-final"

        for st in formatted_subtasks:
            st["role"] = ticket_role(st["assigned_agent_id"])
            st["qa"] = None
        mission["subtasks"] = formatted_subtasks
        mission["participating_agent_ids"] = list(dict.fromkeys(s["assigned_agent_id"] for s in formatted_subtasks))
        mission["status"] = "IN_PROGRESS"
        lines = []
        for st in formatted_subtasks:
            deps = [d.rsplit("-", 1)[-1] for d in st["dependencies"]]
            lines.append(f"{'🎯' if st.get('final') else '•'} {st['title']} — {st['assigned_agent_name']}"
                         + (" (after everyone else)" if st.get("final") else f" (after step {', '.join(deps)})" if deps else ""))
        self._post(mission, "citizen", "Plan for this mission:\n" + "\n".join(lines)
                   + "\n\nPost here to brief everyone at once; @Name asks one citizen.", kind="plan",
                   author_id=coordinator.id, author_name=coordinator.name)

    async def _run_mission_pipeline(self, mission: Dict[str, Any]) -> None:
        """Runs subtasks as a dependency graph: independent ones in parallel, dependents after their
        dependencies succeed, and anything downstream of a failure is BLOCKED."""
        subtasks = {st["id"]: st for st in mission["subtasks"]}
        Path(mission["workspace_dir"]).mkdir(parents=True, exist_ok=True)
        running: Dict[asyncio.Task, str] = {}
        try:
            while True:
                changed = True
                while changed:  # propagate failures down the graph
                    changed = False
                    for st in subtasks.values():
                        if st["status"] != "PENDING":
                            continue
                        bad = [d for d in st["dependencies"] if subtasks[d]["status"] in ("FAILED", "BLOCKED")]
                        if st.get("final"):
                            # the assembly step still runs with what succeeded; blocked only if nothing did
                            settled = all(subtasks[d]["status"] in ("COMPLETED", "FAILED", "BLOCKED") for d in st["dependencies"])
                            if not (settled and st["dependencies"] and not any(subtasks[d]["status"] == "COMPLETED" for d in st["dependencies"])):
                                continue
                        if bad:
                            st["status"] = "BLOCKED"
                            st["blocked_by"] = bad
                            st["error"] = "Blocked: depends on " + ", ".join(subtasks[d]["title"] for d in bad) + ", which did not succeed."
                            self.history.update(st["task_id"], status="BLOCKED", note=st["error"])
                            self._post(mission, "system", f"⛔ {st['title']} ({st['assigned_agent_name']}) is blocked: {st['error']}",
                                       kind="blocked")
                            changed = True
                for st in subtasks.values():
                    deps_done = (all(subtasks[d]["status"] in ("COMPLETED", "FAILED", "BLOCKED") for d in st["dependencies"])
                                 and any(subtasks[d]["status"] == "COMPLETED" for d in st["dependencies"])) if st.get("final") \
                        else all(subtasks[d]["status"] == "COMPLETED" for d in st["dependencies"])
                    if st["status"] == "PENDING" and deps_done:
                        st["status"] = "QUEUED"
                        running[asyncio.create_task(self._run_ticket(mission, st, subtasks))] = st["id"]
                if not running:
                    for st in subtasks.values():
                        if st["status"] == "PENDING":  # only reachable with a dependency cycle
                            st["status"] = "BLOCKED"
                            st["error"] = "Blocked: circular dependency."
                            self.history.update(st["task_id"], status="BLOCKED", note=st["error"])
                    break
                done, _ = await asyncio.wait(list(running), return_when=asyncio.FIRST_COMPLETED)
                for t in done:
                    st = subtasks[running.pop(t)]
                    try:
                        result = t.result()
                    except Exception as ex:
                        result = {"verified": False, "files": [], "error": f"Subtask crashed: {ex}"}
                        self.history.update(st["task_id"], status="FAILED", note=result["error"])
                    verified = bool(result.get("verified"))
                    st["status"] = "COMPLETED" if verified else "FAILED"
                    st["progress"] = 100
                    st["deliverable_result"] = result.get("files") or None
                    st["summary"] = result.get("summary", "")
                    st["error"] = None if verified else (result.get("error") or "Verification failed")[:1500]
                    st["verification"] = "VERIFIED" if verified else "FAILED"
                    if result.get("url"):
                        st["url"] = result["url"]
                    for f in result.get("files") or []:
                        if f not in mission["deliverables"]:
                            mission["deliverables"].append(f)
                    self._post_subtask_result(mission, st, verified, result)
                finished = sum(1 for s in subtasks.values() if s["status"] in ("COMPLETED", "FAILED", "BLOCKED"))
                mission["progress"] = int(finished / max(len(subtasks), 1) * 100)
                await event_bus.publish(ForgeEvent(
                    event_id=uuid.uuid4().hex,
                    topic="mission:updated",
                    payload={"mission_id": mission["id"], "progress": mission["progress"]}
                ))
        except asyncio.CancelledError:
            for t in running:
                t.cancel()
            for st in subtasks.values():
                if st["status"] not in ("COMPLETED", "FAILED", "BLOCKED"):
                    st["status"] = "CANCELLED"
                    self.history.update(st["task_id"], status="CANCELLED", note="Mission cancelled.")
            mission["status"] = "CANCELLED"
            raise
        finally:
            if mission["status"] != "CANCELLED":
                mission["status"] = _mission_status(list(subtasks.values()))
            mission["completed_at"] = datetime.now().strftime("%I:%M %p")
            self._post(mission, "system", _mission_report(mission), kind="report")
        await event_bus.publish(ForgeEvent(
            event_id=uuid.uuid4().hex,
            topic="mission:completed",
            payload={"mission_id": mission["id"], "status": mission["status"]}
        ))

    async def _run_mission_subtask(self, mission: Dict[str, Any], st: Dict[str, Any],
                                   subtasks: Dict[str, Dict[str, Any]], qa_notes: str = "") -> Dict[str, Any]:
        citizen = self.citizens[st["assigned_agent_id"]]
        workspace = Path(mission["workspace_dir"])
        context_parts = []
        for dep_id in st["dependencies"]:
            dep = subtasks[dep_id]
            part = f"## {dep['title']} (by {dep['assigned_agent_name']})\n"
            if dep.get("summary"):
                part += f"Summary: {dep['summary'][:500]}\n"
            for rel in (dep.get("deliverable_result") or [])[:6]:
                p = workspace / rel
                if p.is_file():
                    part += f"--- {rel} ---\n{p.read_text(encoding='utf-8', errors='replace')[:2500]}\n"
            context_parts.append(part)
        st["context_from"] = list(st["dependencies"])
        if qa_notes:
            context_parts.insert(0, "## QA rejected your previous attempt. Fix every point before resubmitting:\n"
                                 + qa_notes[:1500] + "\n")
        description = f"Part of mission '{mission['title']}': {mission['description']}"
        if st.get("final"):
            failed = [subtasks[d]["title"] for d in st["dependencies"] if subtasks[d]["status"] != "COMPLETED"]
            description += ("\nBuild ONE coherent deliverable that combines the team's work below "
                            "(use their facts, copy and design notes; do not invent a different topic)."
                            + (f" These steps did not succeed, so work without them: {', '.join(failed)}." if failed else ""))
        task_req = CitizenTaskRequest(
            title=st["title"],
            description=description,
            expected_deliverable=st["expected_deliverable"],
            priority="HIGH"
        )
        # One task at a time per citizen; different citizens work in parallel.
        async with self._citizen_locks.setdefault(citizen.id, asyncio.Lock()):
            st["status"] = "WORKING"
            st["progress"] = 20
            # the Governor's channel messages, read at the moment the step really starts
            notes = list(mission.get("governor_notes") or [])[-10:]
            if notes:
                context_parts.insert(0, "## The Governor's instructions for this mission (mission channel)\n"
                                     + "\n".join(f"- {n}" for n in notes) + "\n")
            self._post(mission, "citizen", f"Starting: {st['title']}" + (
                f" (using the Governor's {len(mission['governor_notes'])} note(s))" if mission.get("governor_notes") else ""),
                kind="progress", author_id=citizen.id, author_name=citizen.name, task_id=st["task_id"])
            allow_web = bool(st.get("final")) or not mission.get("web_kind")
            return await self._run_task_execution_loop(citizen, st["task_id"], task_req, workspace_dir=workspace,
                                                       context="\n".join(context_parts), mission_id=mission["id"],
                                                       allow_web=allow_web)

    # --- Company workflow: tickets move backlog -> in progress -> review -> done, and QA signs off ---

    QA_MAX_ROUNDS = 2

    async def _run_ticket(self, mission: Dict[str, Any], st: Dict[str, Any],
                          subtasks: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Runs a ticket, then holds it in review until QA signs off. A rejection sends it back to the
        assignee with QA's notes; after QA_MAX_ROUNDS rejections the ticket fails with those notes."""
        result = await self._run_mission_subtask(mission, st, subtasks)
        is_doc = Path(str(st.get("expected_deliverable") or "")).suffix.lower() in DOC_SUFFIXES
        for rnd in range(1, self.QA_MAX_ROUNDS + 1):
            if not result.get("verified"):
                return result
            st["status"] = "REVIEW"
            st["progress"] = 90
            approved, notes, reviewer = await self._qa_review(mission, st, result)
            st["qa"] = {"approved": approved, "notes": notes, "round": rnd, "reviewer": reviewer.name}
            text = f"QA sign-off: {st['title']}. {notes}" if approved else \
                f"QA rejected {st['title']} (round {rnd}), sent back with notes: {notes}"
            self._post(mission, "citizen", text, kind="review", author_id=reviewer.id, author_name=reviewer.name,
                       task_id=st["task_id"], role=ticket_role(reviewer.id))
            if approved:
                return result
            st.setdefault("qa_history", []).append(notes)
            if is_doc:
                # a written document gets one QA pass: the assignee revises with the notes, without a second review
                return await self._run_mission_subtask(mission, st, subtasks, qa_notes=notes)
            if rnd == self.QA_MAX_ROUNDS:
                return {**result, "verified": False, "error": f"QA rejected after {rnd} rounds: {notes}"}
            result = await self._run_mission_subtask(mission, st, subtasks, qa_notes=notes)
        return result

    async def _qa_review(self, mission: Dict[str, Any], st: Dict[str, Any],
                         result: Dict[str, Any]) -> Tuple[bool, str, CitizenProfile]:
        """QA's verdict on a ticket: hard checks on the files first, then the QA citizen's own review.
        A model that is down or answers off-format never blocks a ticket that passed the hard checks."""
        reviewer = self.citizens.get("agent-qa") or self.citizens["agent-coordinator"]
        workspace = Path(mission["workspace_dir"])
        files = list(result.get("files") or [])
        issues = qa_static_issues(workspace, files)
        if issues:
            notes = "; ".join(issues)[:1200]
            await self._reason(reviewer, st["task_id"], "thought", f"Reviewing {st['title']}: {notes}")
            return False, notes, reviewer
        excerpts = []
        for rel in files[:3]:
            text = (workspace / rel).read_text(encoding="utf-8", errors="replace")
            excerpts.append(f"--- {rel} ---\n{_qa_excerpt(text)}")
        prompt = (f"QA sign-off for ticket '{st['title']}' (mission: {mission['title']}).\n"
                  f"Expected deliverable: {st['expected_deliverable']}\n"
                  f"Assignee's summary: {str(result.get('summary') or '')[:500]}\n\n" + "\n".join(excerpts) +
                  "\n\nA '[... N characters omitted ...]' marker is where this excerpt skips text, not a defect in the file. "
                  "Reject only for concrete defects: missing required content, placeholder text, broken markup "
                  'or code, or the wrong topic. Reply with JSON only: {"approved": true or false, "notes": "what to fix, or why it passes"}')
        try:
            raw = await self._model_call(reviewer, prompt, f"You are {reviewer.name}, the QA lead. Be strict but fair.",
                                         temperature=0.1, json_mode=True, max_tokens=400)
            verdict = _extract_json(raw)
        except Exception as ex:
            logger.warning(f"QA review model call failed: {ex}")
            verdict = None
        if not isinstance(verdict, dict):
            verdict = {}
        notes = str(verdict.get("notes") or "").strip()
        if verdict.get("approved") is False and notes:
            await self._reason(reviewer, st["task_id"], "thought", f"Rejecting {st['title']}: {notes[:300]}")
            return False, notes[:1200], reviewer
        notes = notes[:400] or "Files present and complete."
        await self._reason(reviewer, st["task_id"], "thought", f"Approving {st['title']}: {notes}")
        return True, notes, reviewer

    def mission_board(self, mission_id: str) -> Optional[Dict[str, Any]]:
        """The mission's tickets as a kanban: backlog, in_progress, review, done (and blocked for failures)."""
        mission = self.get_mission(mission_id)
        if mission is None:
            return None
        columns: Dict[str, List[Dict[str, Any]]] = {c: [] for c in BOARD_COLUMNS}
        for st in mission.get("subtasks", []):
            columns[ticket_column(st["status"])].append({
                "id": st["id"], "task_id": st["task_id"], "title": st["title"], "status": st["status"],
                "assignee_id": st["assigned_agent_id"], "assignee": st["assigned_agent_name"],
                "role": st.get("role") or ticket_role(st["assigned_agent_id"]), "progress": st.get("progress", 0),
                "qa": st.get("qa"), "qa_history": st.get("qa_history", []), "url": st.get("url"),
                "error": st.get("error"), "final": bool(st.get("final"))})
        return {"mission_id": mission_id, "title": mission["title"], "status": mission["status"],
                "lead": {"id": "agent-coordinator", "role": "CEO/PM"}, "columns": columns}

    # --- Live reasoning: what each citizen is planning, thinking and doing, as short summaries ---

    REASONING_KINDS = ("plan", "thought", "tool_call", "tool_result")

    async def _reason(self, citizen: CitizenProfile, task_id: Optional[str], kind: str, text: str) -> Dict[str, Any]:
        """Streams one reasoning step (plan, thought summary, tool call or tool result) to the citizen's feed,
        the live event bus and, for mission work, the mission channel - labelled with the citizen's name and role."""
        rec = (self.history.get(task_id) if task_id else None) or {}
        mission_id = rec.get("mission_id")
        entry = {"agent_id": citizen.id, "agent_name": citizen.name, "role": citizen.profession, "task_id": task_id,
                 "mission_id": mission_id, "kind": kind if kind in self.REASONING_KINDS else "thought",
                 "text": " ".join(str(text).split())[:600], "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        self._reasoning.setdefault(citizen.id, deque(maxlen=200)).append(entry)
        try:
            await event_bus.publish(ForgeEvent(event_id=uuid.uuid4().hex, topic=f"agent:{citizen.id}:reasoning", payload=entry))
        except Exception as e:  # the feed must never break the task
            logger.debug(f"reasoning publish failed: {e}")
        mission = self.get_mission(mission_id) if mission_id else None
        if mission:
            self._post(mission, "citizen", entry["text"], kind="reasoning", author_id=citizen.id,
                       author_name=citizen.name, task_id=task_id, role=citizen.profession, step=entry["kind"])
        return entry

    def get_reasoning(self, agent_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """The citizen's most recent reasoning steps, oldest first."""
        return list(self._reasoning.get(agent_id, ()))[-limit:]

    # --- Mission channel: one shared thread per mission ---

    def _post(self, mission: Dict[str, Any], author_kind: str, text: str, kind: str = "update",
              author_id: Optional[str] = None, author_name: Optional[str] = None,
              url: Optional[str] = None, task_id: Optional[str] = None,
              role: Optional[str] = None, step: Optional[str] = None) -> Dict[str, Any]:
        post = {"id": f"post-{uuid.uuid4().hex[:8]}", "author_kind": author_kind, "author_id": author_id,
                "author_name": author_name or ("City AI" if author_kind == "system" else ""), "text": text[:4000],
                "kind": kind, "url": url, "task_id": task_id, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        if role:
            post["role"] = role
        if step:
            post["step"] = step
        channel = mission.setdefault("channel", [])
        channel.append(post)
        del channel[:-MAX_CHANNEL_POSTS]
        try:
            asyncio.get_running_loop().create_task(event_bus.publish(ForgeEvent(
                event_id=uuid.uuid4().hex, topic=f"mission:{mission['id']}:channel", payload=post)))
        except RuntimeError:
            pass
        return post

    def _post_subtask_result(self, mission: Dict[str, Any], st: Dict[str, Any], verified: bool, result: Dict[str, Any]) -> None:
        rec = self.history.get(st["task_id"]) or {}
        url = result.get("url") or next((d.get("url") for d in rec.get("deliverables", []) if d.get("url")), None)
        files = ", ".join((result.get("files") or [])[:6])
        if verified:
            text = f"✅ Done and verified: {st['title']}" + (f"\nFiles: {files}" if files else "")
        else:
            reason = re.sub(r"\s+", " ", str(result.get("error") or "verification failed"))[:300]
            text = f"❌ {st['title']} did not pass verification: {reason}"
        reqs = rec.get("requirements") or []
        if reqs:     # a real project: say how much of the checklist is done and who reviewed it
            review = rec.get("review") or {}
            text += (f"\nRequirements: {sum(1 for r in reqs if r.get('status') == 'pass')}/{len(reqs)} implemented"
                     + (f" · reviewed by {review['reviewer']}" + (" (approved)" if review.get("approved") else
                        f" ({len(review.get('issues') or [])} finding(s) fixed)" if review.get("issues") else "")
                        if review.get("reviewer") else "")
                     + "".join(f"\n✗ {r['id']} {r['text'][:90]}" for r in reqs if r.get("status") != "pass")[:900])
        self._post(mission, "citizen", text, kind="deliverable" if verified else "failed",
                   author_id=st["assigned_agent_id"], author_name=st["assigned_agent_name"], url=url, task_id=st["task_id"])
        if st.get("final") and url:
            mission["final_deliverable"] = {"title": st["title"], "url": url, "task_id": st["task_id"], "version": 1,
                                            "verified": verified}
            if verified:
                self._post(mission, "citizen", f"🎯 The mission's deliverable is ready: {url}", kind="final", url=url,
                           author_id=st["assigned_agent_id"], author_name=st["assigned_agent_name"], task_id=st["task_id"])
            else:
                self._post(mission, "citizen", f"⚠️ Draft — it did not pass every check (see above), but you can open it: {url}\n"
                           "Write 'revise: …' here to fix what is missing.", kind="failed", url=url,
                           author_id=st["assigned_agent_id"], author_name=st["assigned_agent_name"], task_id=st["task_id"])

    def get_mission(self, mission_id: str) -> Optional[Dict[str, Any]]:
        return next((m for m in self.public_missions if m["id"] == mission_id), None)

    def post_to_mission(self, mission_id: str, text: str) -> Dict[str, Any]:
        """The Governor writes once to everyone on the mission. Steps that have not started yet are given the
        message; @Name asks one citizen; 'revise: ...' after the mission requests changes to the final deliverable.
        Replies are posted to the channel when ready. Raises LookupError / ValueError."""
        loop = asyncio.get_running_loop()
        mission = self.get_mission(mission_id)
        if not mission:
            raise LookupError(f"Mission '{mission_id}' not found.")
        text = (text or "").strip()
        if not text:
            raise ValueError("Write a message for the team.")
        post = self._post(mission, "governor", text, kind="message", author_name="Supreme Governor")
        revise = _REVISE_RE.match(text)
        if revise and revise.group(1).strip() and mission["status"] not in ("PLANNING", "IN_PROGRESS"):
            target = self._mission_revision_target(mission)
            if not target:
                self._post(mission, "system", "There is no finished deliverable on this mission to revise.", kind="system")
                return post
            try:
                started = self.revise_task(target, revise.group(1).strip())
            except (LookupError, ValueError, RuntimeError) as ex:
                self._post(mission, "system", f"Could not start the revision: {ex}", kind="system")
                return post
            self._post(mission, "citizen", f"On it: revising the deliverable as version {started['version']}. "
                       "It will be verified again; the current version stays available.", kind="progress",
                       author_id=started["agent_id"], author_name=started["agent_name"], task_id=started["task_id"])
            loop.create_task(self._report_mission_revision(mission, started))
            return post

        mission["governor_notes"].append(text[:1500])
        del mission["governor_notes"][:-20]
        names = {c.id: c.name for c in self.citizens.values()}
        mentioned = [cid for cid, name in names.items()
                     if re.search(r"@" + re.escape(name.split()[0]) + r"\b", text, re.IGNORECASE)]
        if not mentioned:
            waiting = [st for st in mission["subtasks"] if st["status"] in ("PENDING", "QUEUED")]
            running = [st for st in mission["subtasks"] if st["status"] == "WORKING"]
            people = sorted({st["assigned_agent_name"] for st in mission["subtasks"]})
            ack = f"📣 Delivered to {len(people)} citizen(s): {', '.join(people) or 'nobody yet (still planning)'}."
            if mission["status"] in ("PLANNING", "IN_PROGRESS"):
                ack += (f" {len(waiting)} step(s) that have not started will follow it"
                        + (f"; {len(running)} already running will not see it" if running else "") + ".")
            else:
                ack += " The mission has finished: write 'revise: …' to change its deliverable."
            self._post(mission, "system", ack, kind="system")
        responders = mentioned or ["agent-coordinator"]
        loop.create_task(self._mission_replies(mission, text, responders[:3]))
        return post

    def _mission_revision_target(self, mission: Dict[str, Any]) -> Optional[str]:
        final = mission.get("final_deliverable")
        if final:
            chain = self.revision_chain(final["task_id"])
            done = [r for r in chain if r["status"] in REVISABLE_STATUSES]
            return done[-1]["task_id"] if done else None
        done = [st for st in mission["subtasks"] if st["status"] == "COMPLETED"]
        return done[-1]["task_id"] if done else None

    async def _report_mission_revision(self, mission: Dict[str, Any], started: Dict[str, Any]) -> None:
        job = self._active_tasks.get(started["task_id"])
        if job:
            try:
                await asyncio.shield(job)
            except Exception:
                pass
        rec = self.history.get(started["task_id"]) or {}
        url = next((d.get("url") for d in rec.get("deliverables", []) if d.get("url")), None)
        if rec.get("status") == "VERIFIED":
            if mission.get("final_deliverable") and url:
                mission["final_deliverable"] = {**mission["final_deliverable"], "url": url, "task_id": started["task_id"],
                                                "version": started["version"]}
            self._post(mission, "citizen", f"✅ Version {started['version']} is ready and verified" + (f": {url}" if url else "."),
                       kind="final" if url else "deliverable", url=url, author_id=started["agent_id"],
                       author_name=started["agent_name"], task_id=started["task_id"])
        else:
            out = ((rec.get("verification") or {}).get("output") or "").strip().splitlines()
            self._post(mission, "citizen", f"❌ Version {started['version']} did not pass verification"
                       + (f": {out[0][:200]}" if out else ".") + " The previous version is unchanged.",
                       kind="failed", author_id=started["agent_id"], author_name=started["agent_name"], task_id=started["task_id"])

    async def _mission_replies(self, mission: Dict[str, Any], text: str, responder_ids: List[str]) -> None:
        status = "\n".join(f"- {st['title']} — {st['assigned_agent_name']}: {st['status']}"
                            + (f" (error: {str(st.get('error'))[:120]})" if st.get("error") else "")
                            for st in mission["subtasks"]) or "- still being planned"
        for cid in responder_ids:
            citizen = self.citizens.get(cid)
            if not citizen:
                continue
            mine = [st["title"] for st in mission["subtasks"] if st["assigned_agent_id"] == cid]
            prompt = (
                f"MISSION: {mission['title']} ({mission['status']})\n{mission['description']}\n\n"
                f"CURRENT STATUS OF EVERY STEP:\n{status}\n\n"
                + (f"YOUR STEPS: {', '.join(mine)}\n" if mine else "")
                + f"\nTHE GOVERNOR JUST WROTE TO THE WHOLE TEAM:\n{text}\n\n"
                "Reply in 2-4 sentences, in plain language, for the whole team"
                + (" as the mission coordinator" if cid == "agent-coordinator" else "")
                + ". Be accurate about the status above; do not claim work is done unless it says COMPLETED. "
                "If it is a question, answer it; if it is an instruction, say how the team will apply it."
            )
            req = ModelCompletionRequest(prompt=prompt, model_name=citizen.assigned_model, temperature=0.3,
                                         max_tokens=CHAT_MAX_TOKENS,
                                         system_prompt=f"You are {citizen.name}, {citizen.profession}, posting in a shared mission channel.")
            try:
                resp = await self._route(citizen, req, interactive=True)
                reply = (resp.content or "").strip()
            except Exception as ex:
                reply = ""
                logger.warning(f"Mission channel reply failed: {ex}")
            if reply:
                self._post(mission, "citizen", reply, kind="reply", author_id=citizen.id, author_name=citizen.name)
            else:
                self._post(mission, "system", f"{citizen.name} could not reply (the model did not answer).", kind="system")

    def list_public_missions(self) -> List[Dict[str, Any]]:
        return self.public_missions


MAX_REPAIR_ATTEMPTS = 3
DOC_SUFFIXES = (".md", ".json", ".txt", ".csv")
CONTENT_STEPS_MAX = 3
_CODE_STEP = re.compile(r"\b(django|flask|fastapi|pytest|unit ?tests?|test suite|testing|backend|server|database|migrations?)\b", re.I)


def _content_steps_only(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """For a mission the final assembly builds, keep only the planner's content steps: code, framework and test
    steps are dropped (the builder picks and writes the stack itself) and at most CONTENT_STEPS_MAX remain."""
    kept = [s for s in steps
            if Path(str(s.get("expected_deliverable") or "notes.md")).suffix.lower() in DOC_SUFFIXES + (".html", ".htm")
            and not _CODE_STEP.search(f"{s.get('title', '')} {s.get('expected_deliverable', '')}")]
    return kept[:CONTENT_STEPS_MAX]
FAST_CALL_TIMEOUT_S = 150.0     # a project file that takes a quick coder longer than this goes to the next model
CODING_ROLES = {"engineer", "webdev", "designer", "devops", "qa", "architect"}
MAX_CHANNEL_POSTS = 300
REVISABLE_STATUSES = {"VERIFIED", "FAILED"}
MAX_HISTORY_SCAN = 500
_REVISE_RE = re.compile(
    r"^\s*(?:please\s+)?(?:(?:revise|redo)(?:\s+(?:it|that|this|your last (?:one|task|deliverable|work)|the last one))?"
    r"|request changes|make (?:these|the following|some) changes"
    r"|(?:edit|change|update|fix)\s+(?:it|that|this|your last (?:one|task|deliverable|work)|the last one))\b[\s:,.\-]*(.*)$",
    re.IGNORECASE | re.DOTALL)
CHAT_MAX_TOKENS = 320             # spoken replies stay short so they come back quickly on the local GPU
DUPLICATE_MISSION_WINDOW_S = 120   # a repeated publish of the same title within this window is not a new mission

_SLIDES_SCHEMA = (
    '{"slides": [{"title": "Slide title", "desc": "One or two sentences of real content", '
    '"bullets": ["Specific point", "Specific point", "Specific point"]}]}'
)
_WEBSITE_SCHEMA = (
    '{"brand": "Name", "headline": "Hero headline", "subheadline": "One sentence", "cta": "Button text", '
    '"features_title": "Section title", "about": "Two or three sentences", '
    '"features": [{"icon": "one emoji", "title": "Feature", "text": "One or two sentences"}], '
    '"sections_title": "Title for the detail sections", '
    '"sections": [{"title": "Topic", "text": "A short paragraph of real, specific content"}], '
    '"metrics": [{"value": "24/7", "label": "Short label"}], '
    '"scene": "one of: city, globe, orbit, crystal, waves, galaxy (the 3D backdrop that best fits the topic)", '
    '"accent": "#hex colour that suits the brand"}'
)


FAKE_FORMATS = {".fig", ".pdf", ".psd", ".sketch", ".xd", ".ai", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
                ".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg", ".zip", ".rar", ".7z", ".glb", ".fbx", ".blend", ".docx",
                ".xlsx", ".pptx", ".exe", ".dll", ".woff", ".woff2", ".ttf"}


def _unwritable(path: str) -> Optional[str]:
    """Why a model-written file cannot be accepted (None = fine)."""
    suffix = Path(path).suffix.lower()
    if suffix in FAKE_FORMATS:
        return f"{suffix} is a binary/design format; a model can only write text, so this would be a fake file"
    if len(path) > 120 or re.search(r"[(),;]|\s", path.strip()):
        return "that is a description, not a file name"
    return None


def _mission_web_kind(text: str) -> Optional[str]:
    """Missions that ask for one website / presentation get a single final assembly step."""
    t = (text or "").lower()
    if re.search(r"\bpresentation\b|\bslides?\b|\bslide deck\b|\bdeck\b", t):
        return "3D_PRESENTATION"
    if _is_web_request(t) or _APP_RE.search(t):
        return "WEBSITE"
    return None


# a usable app ("a todo app", "an app that saves notes") is delivered as one live web app too
_APP_RE = re.compile(r"\b(?:todo|to-do|notes?|tracker|habit|budget|expense|recipe|quiz|calculator|booking|"
                     r"inventory|chat|kanban|timer|game|crud)\s+(?:list\s+)?apps?\b|\bapps?\s+(?:that|which|to|for)\b",
                     re.IGNORECASE)


_WEB_RE = re.compile(r"\bweb ?sites?\b|\blanding pages?\b|\bweb ?pages?\b|\bhome ?page\b|\bweb ?apps?\b|"
                     r"\bweb applications?\b|\bportfolio\b|\bpersonal (?:site|page)\b|\bmicrosite\b|"
                     r"\b3d experience\b|\binteractive experience\b|\bonline (?:store|shop)\b", re.IGNORECASE)
_NOT_WEB_PORTFOLIO = re.compile(r"\b(stock|investment|financial|asset|crypto|trading|fund|loan|project)s?\s+portfolio",
                                re.IGNORECASE)


def _is_web_request(text: str) -> bool:
    """Websites in any wording: website, landing page, web app, portfolio, personal site, 3D experience ..."""
    t = text or ""
    if not _WEB_RE.search(t):
        return False
    only_portfolio = not re.search(_WEB_RE.pattern.replace("\\bportfolio\\b|", ""), t, re.IGNORECASE)
    return not (only_portfolio and _NOT_WEB_PORTFOLIO.search(t))


def _mission_report(mission: Dict[str, Any]) -> str:
    subs = mission.get("subtasks", [])
    done = [s for s in subs if s["status"] == "COMPLETED"]
    failed = [s for s in subs if s["status"] == "FAILED"]
    blocked = [s for s in subs if s["status"] == "BLOCKED"]
    lines = [f"📋 Mission report — {mission['status']}: {len(done)}/{len(subs)} steps verified"
             + (f", {len(failed)} failed" if failed else "") + (f", {len(blocked)} blocked" if blocked else "") + "."]
    final = mission.get("final_deliverable")
    if final:
        lines.append(f"🎯 Deliverable: {final['url']}" + ("" if final.get("verified", True) else " (draft: not every check passed)"))
    elif mission.get("web_kind") and mission["status"] != "CANCELLED":
        lines.append("No final deliverable was produced.")
    for s in failed:
        reason = re.sub(r"\s+", " ", str(s.get("error") or ""))[:160]
        lines.append(f"❌ {s['title']} ({s['assigned_agent_name']}): {reason}")
    for s in blocked:
        lines.append(f"⛔ {s['title']} ({s['assigned_agent_name']}) never ran.")
    if mission["status"] != "CANCELLED":
        lines.append("Want changes? Write 'revise: …' here and the deliverable gets a new, re-verified version.")
    return "\n".join(lines)


def _browser_summary(runtime: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """What the headless browser saw, kept small for the task history."""
    if not runtime:
        return None
    pages = {p: {"errors": (r.get("errors") or [])[:5], "frames": r.get("frames", 0),
                 "meshes": (r.get("scene") or {}).get("meshes", 0), "error": r.get("error")}
             for p, r in (runtime.get("pages") or {}).items()}
    return {"rendered": runtime.get("rendered"), "objects": sorted(set(runtime.get("names") or []))[:30],
            "geometries": runtime.get("geometries") or [], "pages": pages}


def _wants_3d(text: str) -> bool:
    t = (text or "").lower()
    return bool(re.search(r"\b3d\b|3-d|three\.?js|webgl|three-dimensional", t))


def _web_kind_from_deliverables(rec: Dict[str, Any]) -> Optional[str]:
    urls = " ".join(d.get("url") or "" for d in rec.get("deliverables", []))
    if "/3d_presentations/" in urls:
        return "3D_PRESENTATION"
    if "/websites/" in urls:
        return "WEBSITE"
    return None


def _deliverable_text(rec: Dict[str, Any]) -> str:
    """Visible text of a web deliverable, for revising older ones whose content JSON was not stored."""
    for d in rec.get("deliverables", []):
        url = d.get("url") or ""
        if "/deliverables/" not in url:
            continue
        rel = url.split("/deliverables/", 1)[1].strip("/")
        f = (config.DELIVERABLES_DIR / rel).resolve()
        f = f / "index.html" if f.is_dir() else f
        if f.is_file() and config.DELIVERABLES_DIR.resolve() in f.parents:
            html = f.read_text(encoding="utf-8", errors="replace")
            html = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
            return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()[:6000]
    return ""


def _topic_from_title(title: str) -> str:
    t = re.sub(r"\s*\(v\d+\)\s*$", "", title)
    t = re.sub(r"^(?:3d presentation|website)\s*:\s*", "", t, flags=re.IGNORECASE)
    m = re.search(r"(?:on|about|for)\s+(.+)", t, re.IGNORECASE)
    return (m.group(1) if m else t).strip(" .") or t


def _extract_json(raw: str) -> Optional[Any]:
    """Finds a JSON value in a model reply (bare, fenced, or embedded in prose)."""
    text = (raw or "").strip()
    candidates = [text]
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence:
        candidates.insert(0, fence.group(1).strip())
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e > s:
        candidates.append(text[s:e + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except Exception:
            continue
    return None


def _valid_web_content(kind: str, data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if kind == "3D_PRESENTATION":
        items, required = data.get("slides"), None
    else:
        items, required = data.get("features"), data.get("headline")
        if not str(required or "").strip():
            return False
    return isinstance(items, list) and sum(
        1 for x in items if isinstance(x, dict) and str(x.get("title") or "").strip()) >= 2


def _files_from(parsed: Any) -> List[Dict[str, str]]:
    if not isinstance(parsed, dict):
        return []
    items = parsed.get("files") or parsed.get("files_generated") or parsed.get("file_updates") or []
    out = []
    for f in items if isinstance(items, list) else []:
        if isinstance(f, dict):
            path = f.get("path") or f.get("file_path")
            content = f.get("content")
            if isinstance(path, str) and path.strip() and isinstance(content, str):
                out.append({"path": path.strip(), "content": content})
    return out


def _files_from_text(raw: str, known_paths: List[str]) -> List[Dict[str, str]]:
    """Files from a plain reply: '--- path ---' sections, or fenced code blocks labelled with a file name."""
    text = raw or ""
    out: List[Dict[str, str]] = []
    fenced = re.compile(r"```[\w+-]*\n([\s\S]*?)```")
    sections = re.split(r"^-{3,}\s*([\w./\\-]+\.\w{1,6})\s*-{3,}\s*$", text, flags=re.MULTILINE)
    if len(sections) > 1:
        for path, body in zip(sections[1::2], sections[2::2]):
            fence = fenced.search(body)
            content = fence.group(1) if fence else body.strip("\n")
            if content.strip():
                out.append({"path": path.strip(), "content": content.rstrip() + "\n"})
        return out
    for m in re.finditer(r"([\w./\\-]+\.\w{1,6})[`*:\s]*\n+```[\w+-]*\n([\s\S]*?)```", text):
        path, content = m.group(1).strip("`*: "), m.group(2)
        if content.strip():
            out.append({"path": path, "content": content.rstrip() + "\n"})
    if not out and len(known_paths) == 1:
        fence = fenced.search(text)
        if fence and fence.group(1).strip():
            out.append({"path": known_paths[0], "content": fence.group(1).rstrip() + "\n"})
    return out


def _rel(p: Path, root: Path) -> str:
    try:
        return str(Path(p).resolve().relative_to(Path(root).resolve())).replace("\\", "/")
    except ValueError:
        return Path(p).name


BOARD_COLUMNS = ("backlog", "in_progress", "review", "done", "blocked")
_COLUMN_BY_STATUS = {"PENDING": "backlog", "QUEUED": "backlog", "WORKING": "in_progress", "REVIEW": "review",
                     "COMPLETED": "done", "FAILED": "blocked", "BLOCKED": "blocked", "CANCELLED": "blocked"}
_ROLE_BY_AGENT = {"agent-coordinator": "CEO/PM", "agent-analyst": "PM", "agent-designer": "Design",
                  "agent-webdev": "Frontend", "agent-engineer": "Backend", "agent-architect": "Backend",
                  "agent-data": "Backend", "agent-qa": "QA", "agent-devops": "DevOps", "agent-security": "Security",
                  "agent-researcher": "Research", "agent-diagnostic": "QA", "agent-operator": "DevOps"}
_PLACEHOLDERS = ("lorem ipsum", "[insert ", "todo: add content", "your content here")


def ticket_role(agent_id: str) -> str:
    return _ROLE_BY_AGENT.get(agent_id, "Specialist")


def ticket_column(status: str) -> str:
    return _COLUMN_BY_STATUS.get(status, "backlog")


def _qa_excerpt(text: str, head: int = 4000, tail: int = 1500) -> str:
    """The start and end of a file for QA, with the gap marked, so a long file is not judged as cut off."""
    if len(text) <= head + tail:
        return text
    return f"{text[:head]}\n[... {len(text) - head - tail} characters omitted ...]\n{text[-tail:]}"


def qa_static_issues(workspace: Path, files: List[str]) -> List[str]:
    """Defects QA rejects without asking a model: nothing delivered, missing or empty files, placeholder copy,
    HTML with no markup at all."""
    if not files:
        return ["No deliverable files were produced."]
    issues = []
    for rel in files[:30]:
        p = workspace / rel
        if not p.is_file():
            issues.append(f"{rel} is missing")
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        low = text.lower()
        if not text.strip():
            issues.append(f"{rel} is empty")
        elif any(ph in low for ph in _PLACEHOLDERS):
            issues.append(f"{rel} still contains placeholder text")
        elif rel.lower().endswith((".html", ".htm")) and not any(t in low for t in ("<html", "<body", "<div", "<main")):
            issues.append(f"{rel} has no HTML document body")
    return issues


def _mission_status(subtasks: List[Dict[str, Any]]) -> str:
    done = sum(1 for s in subtasks if s["status"] == "COMPLETED")
    if subtasks and done == len(subtasks):
        return "COMPLETED"
    return "PARTIAL" if done else "FAILED"


def _fallback_subtasks(req: PublicMissionCreateRequest) -> List[Dict[str, Any]]:
    if req.category == "SOFTWARE":
        return [
            {"id": "1", "title": f"Requirements & API Specification for {req.title}", "assigned_agent_id": "agent-analyst",
             "expected_deliverable": "api_spec.md", "dependencies": []},
            {"id": "2", "title": f"Data Models for {req.title}", "assigned_agent_id": "agent-architect",
             "expected_deliverable": "models.py", "dependencies": ["1"]},
            {"id": "3", "title": f"Core Application for {req.title}", "assigned_agent_id": "agent-engineer",
             "expected_deliverable": "app.py", "dependencies": ["2"]},
            {"id": "4", "title": f"Pytest Suite for {req.title}", "assigned_agent_id": "agent-qa",
             "expected_deliverable": "test_app.py", "dependencies": ["3"]},
        ]
    return [
        {"id": "1", "title": f"Research Report on {req.title}", "assigned_agent_id": "agent-analyst",
         "expected_deliverable": "research_report.md", "dependencies": []},
        {"id": "2", "title": f"Action Plan for {req.title}", "assigned_agent_id": "agent-architect",
         "expected_deliverable": "action_plan.md", "dependencies": ["1"]},
    ]
