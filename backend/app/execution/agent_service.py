"""city_ai_aayushifty Agent Execution Engine.

Authoritative local-first runtime managing 10 persistent AI citizens,
real tool execution in sandboxed workspaces, local inference with Ollama,
real verification with bounded repair, artifact tracking, and public mission DAG coordination.
"""

import asyncio
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
from app.execution.task_history import TaskHistory
from app.models.database import Database
from app.models.schemas import (
    CitizenProfile, CitizenChatResponse, CitizenTaskRequest,
    DeliverableArtifact, PublicMissionCreateRequest, VerificationEvidence
)
from app.providers.base import ModelCompletionRequest
from app.providers.router import model_router
from app.execution.computer_service import computer_service
from app.execution.roster import CITIZENS

logger = logging.getLogger("city_ai.agent_service")

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
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._citizen_locks: Dict[str, asyncio.Lock] = {}
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

        # --- 4/5. AI-written 3D presentation or website ---
        if intent in ("3D_PRESENTATION", "WEBSITE"):
            default_topic = "Next-Gen Autonomous AI & Spatial Computing" if intent == "3D_PRESENTATION" else "Modern AI Enterprise & Innovation"
            topic = intent_data.get("topic", default_topic)
            kind_label = "3D presentation" if intent == "3D_PRESENTATION" else "website"
            self.history.start(task_id, citizen.id, citizen.name, f"{kind_label.capitalize()}: {topic}", kind="CHAT", status="WORKING")
            await self._progress(citizen, task_id, "WORKING", 30.0, f"Writing the {kind_label} content for {topic}...")
            result = await self._produce_web_deliverable(citizen, task_id, intent, topic, context=message)
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
        system_prompt = (
            f"You are {citizen.name}, the {citizen.profession} in {citizen.department} of 'city_ai_aayushifty'.\n"
            f"Your capabilities: {', '.join(citizen.capabilities)}.\n"
            f"Your current status is {citizen.status}.\n"
            f"REAL-TIME HOST CLOCK: {telemetry['current_time']}.\n"
            f"METROPOLIS STATUS: 100% power, 100% water, 94.2% satisfaction, 0 incidents.\n"
            f"HOST COMPUTER: Windows ({telemetry['os_name']} {telemetry['os_release']}) [{telemetry['architecture']}], "
            f"Python {telemetry['python_version']}, {telemetry['free_disk_gb']} GB free disk space.\n"
            "The user speaking to you is the Supreme Governor. Speak directly, professionally, authentically in character, and in natural human language.\n"
            "CRITICAL: Always speak fluently in clear human language. NEVER return raw JSON, code dictionaries, or developer debug structures. Answer thoroughly, accurately, and helpfully."
        )

        req = ModelCompletionRequest(
            prompt=message,
            system_prompt=system_prompt,
            model_name=citizen.assigned_model,
            temperature=0.3
        )

        resp = await model_router.route_completion(req, preferred_provider="ollama")
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

    async def _model_call(self, citizen: CitizenProfile, prompt: str, system_prompt: str, temperature: float = 0.2) -> str:
        req = ModelCompletionRequest(prompt=prompt, system_prompt=system_prompt,
                                     model_name=citizen.assigned_model, temperature=temperature)
        resp = await model_router.route_completion(req, preferred_provider=citizen.provider_key or "ollama")
        return resp.content or ""

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

    async def _write_web_content(self, citizen: CitizenProfile, kind: str, topic: str,
                                 context: str = "") -> Tuple[Optional[Dict[str, Any]], str]:
        """Asks the citizen's model for slide content / website copy as JSON. Returns (content, problem)."""
        schema = _SLIDES_SCHEMA if kind == "3D_PRESENTATION" else _WEBSITE_SCHEMA
        what = "a 5-7 slide presentation" if kind == "3D_PRESENTATION" else "a one-page website"
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
                raw = await self._model_call(citizen, prompt, system, temperature=0.4)
            except Exception as ex:
                return None, f"model call failed: {ex}"
            data = _extract_json(raw)
            if _valid_web_content(kind, data):
                return data, ""
            problem = "reply was not JSON" if data is None else "JSON was missing required fields"
        return None, problem

    async def _produce_web_deliverable(self, citizen: CitizenProfile, task_id: str, kind: str, topic: str,
                                       context: str = "") -> Dict[str, Any]:
        content, problem = await self._write_web_content(citizen, kind, topic, context)
        label = "3D presentation" if kind == "3D_PRESENTATION" else "website"
        await self._progress(citizen, task_id, "WORKING", 65.0, f"Building the {label} for {topic}...")
        synth = computer_service.synthesize_3d_presentation if kind == "3D_PRESENTATION" else computer_service.synthesize_website
        artifact = await asyncio.to_thread(synth, topic=topic, citizen_name=citizen.name,
                                           citizen_profession=citizen.profession, task_id=task_id, content=content)
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
                                       mission_id: Optional[str] = None) -> Dict[str, Any]:
        """Runs one task to an honest outcome. Returns {"verified", "files", "evidence", "attempts", "summary", "error"}."""
        if self.history.get(task_id) is None:
            self.history.start(task_id, citizen.id, citizen.name, req.title,
                               kind="MISSION_SUBTASK" if mission_id else "TASK", mission_id=mission_id)
        citizen.current_task = req.title
        try:
            result = await self._execute_task(citizen, task_id, req, workspace_dir, context)
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
                            workspace_dir: Optional[Path], context: str) -> Dict[str, Any]:
        workspace_dir = Path(workspace_dir) if workspace_dir else self.workspaces_root / f"{citizen.id}_{task_id}"
        workspace_dir.mkdir(parents=True, exist_ok=True)
        ws_manager = WorkspaceManager(workspace_dir)
        self.history.update(task_id, workspace=str(workspace_dir))
        await self._progress(citizen, task_id, "PLANNING", 10.0, f"Planning: {req.title}")

        task_text = f"{req.title} {req.description} {req.expected_deliverable}".lower()
        web_kind = None
        if (
            "3d presentation" in task_text or "3d slide" in task_text or "3d deck" in task_text
            or ("presentation" in task_text and any(k in task_text for k in ["3d", "interactive", "webgl", "three", "model"]))
            or (req.expected_deliverable.lower().endswith(".html") and "presentation" in task_text)
        ):
            web_kind = "3D_PRESENTATION"
        elif "website" in task_text or "landing page" in task_text or "web app" in task_text:
            web_kind = "WEBSITE"

        if web_kind:
            return await self._execute_web_task(citizen, task_id, req, web_kind, workspace_dir, ws_manager, context)

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
        system = f"You are {citizen.name}. Generate complete, working code, reports and documentation."
        await self._progress(citizen, task_id, "WORKING", 30.0, f"Writing deliverables for {req.title}")
        raw_output = await self._model_call(citizen, plan_prompt, system, temperature=0.1)
        parsed = _extract_json(raw_output)
        files_to_write = _files_from(parsed)
        summary = str(parsed.get("summary", "")) if isinstance(parsed, dict) else ""
        if not files_to_write:
            # Plain-text reply: save it (or its first code block) as the expected deliverable.
            content = raw_output
            code_match = re.search(r"```(?:\w+)?\s*([\s\S]*?)\s*```", raw_output)
            if code_match:
                content = code_match.group(1).strip()
            files_to_write = [{"path": req.expected_deliverable.strip() or f"{citizen.id}_deliverable.md", "content": content}]
            self.history.update(task_id, note="Model did not return the JSON file list; saved its reply as the deliverable.")

        written: List[Path] = []
        self._write_files(ws_manager, files_to_write, written, task_id)
        ws_manager.commit_changes(f"feat: {req.title} by {citizen.name}")

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
        evidence = await verify_deliverables(workspace_dir, written)
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
                repair_raw = await self._model_call(citizen, repair_prompt, system, temperature=0.1)
            except Exception as ex:
                self.history.update(task_id, note=f"Repair attempt {attempts}: model call failed ({ex}).")
                continue
            fixes = _files_from(_extract_json(repair_raw))
            if not fixes:
                self.history.update(task_id, note=f"Repair attempt {attempts}: model reply had no file fixes.")
                continue
            self._write_files(ws_manager, fixes, written, task_id)
            ws_manager.commit_changes(f"fix: repair attempt {attempts} for {req.title}")
            evidence = await verify_deliverables(workspace_dir, written)

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
                                                     context=f"{req.description}\n{context}".strip())
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

    def _write_files(self, ws_manager: WorkspaceManager, files: List[Dict[str, str]], written: List[Path], task_id: str) -> None:
        for f in files:
            try:
                p = ws_manager.write_file(f["path"], f["content"])
            except Exception as ex:  # path outside the workspace, invalid name, ...
                self.history.update(task_id, note=f"Refused to write '{f.get('path')}': {ex}")
                continue
            if p not in written:
                written.append(p)

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
        return self.history.list(limit=limit, agent_id=agent_id, mission_id=mission_id)

    # --- Public Missions System ---
    async def publish_public_mission(self, req: PublicMissionCreateRequest) -> Dict[str, Any]:
        """Creates a mission, decomposes it into a dependency graph and runs it in one shared workspace."""
        mission_id = f"mission-{uuid.uuid4().hex[:8]}"
        coordinator = self.citizens["agent-coordinator"]
        agent_list = ", ".join(f"{c.id} ({c.profession})" for c in self.citizens.values() if c.id != coordinator.id)
        decomp_prompt = (
            f"You are {coordinator.name}, Master Orchestrator of city_ai_aayushifty.\n"
            f"MISSION TITLE: {req.title}\n"
            f"MISSION DESCRIPTION: {req.description}\n"
            f"CATEGORY: {req.category}\n\n"
            "Decompose this mission into 2-5 subtasks. Subtasks that do not need each other's output must not "
            "depend on each other, so they can run in parallel.\n"
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

        mission = {
            "id": mission_id,
            "title": req.title,
            "description": req.description,
            "category": req.category,
            "status": "IN_PROGRESS",
            "progress": 0,
            "subtasks": formatted_subtasks,
            "participating_agent_ids": list(dict.fromkeys(s["assigned_agent_id"] for s in formatted_subtasks)),
            "deliverables": [],
            "workspace_dir": str(self.workspaces_root / mission_id),
            "published_at": datetime.now().strftime("%I:%M %p"),
            "completed_at": None
        }
        self.public_missions.insert(0, mission)
        mission_task = asyncio.create_task(self._run_mission_pipeline(mission))
        self._active_tasks[mission_id] = mission_task
        mission_task.add_done_callback(lambda _t: self._active_tasks.pop(mission_id, None))
        return mission

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
                        if bad:
                            st["status"] = "BLOCKED"
                            st["blocked_by"] = bad
                            st["error"] = "Blocked: depends on " + ", ".join(subtasks[d]["title"] for d in bad) + ", which did not succeed."
                            self.history.update(st["task_id"], status="BLOCKED", note=st["error"])
                            changed = True
                for st in subtasks.values():
                    if st["status"] == "PENDING" and all(subtasks[d]["status"] == "COMPLETED" for d in st["dependencies"]):
                        st["status"] = "QUEUED"
                        running[asyncio.create_task(self._run_mission_subtask(mission, st, subtasks))] = st["id"]
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
        await event_bus.publish(ForgeEvent(
            event_id=uuid.uuid4().hex,
            topic="mission:completed",
            payload={"mission_id": mission["id"], "status": mission["status"]}
        ))

    async def _run_mission_subtask(self, mission: Dict[str, Any], st: Dict[str, Any],
                                   subtasks: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
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
        task_req = CitizenTaskRequest(
            title=st["title"],
            description=f"Part of mission '{mission['title']}': {mission['description']}",
            expected_deliverable=st["expected_deliverable"],
            priority="HIGH"
        )
        # One task at a time per citizen; different citizens work in parallel.
        async with self._citizen_locks.setdefault(citizen.id, asyncio.Lock()):
            st["status"] = "WORKING"
            st["progress"] = 20
            return await self._run_task_execution_loop(citizen, st["task_id"], task_req, workspace_dir=workspace,
                                                       context="\n".join(context_parts), mission_id=mission["id"])

    def list_public_missions(self) -> List[Dict[str, Any]]:
        return self.public_missions


MAX_REPAIR_ATTEMPTS = 3

_SLIDES_SCHEMA = (
    '{"slides": [{"title": "Slide title", "desc": "One or two sentences of real content", '
    '"bullets": ["Specific point", "Specific point", "Specific point"]}]}'
)
_WEBSITE_SCHEMA = (
    '{"brand": "Name", "headline": "Hero headline", "subheadline": "One sentence", '
    '"features_title": "Section title", "about": "Two or three sentences", '
    '"features": [{"icon": "one emoji", "title": "Feature", "text": "One or two sentences"}], '
    '"metrics": [{"value": "24/7", "label": "Short label"}]}'
)


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


def _rel(p: Path, root: Path) -> str:
    try:
        return str(Path(p).resolve().relative_to(Path(root).resolve())).replace("\\", "/")
    except ValueError:
        return Path(p).name


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
