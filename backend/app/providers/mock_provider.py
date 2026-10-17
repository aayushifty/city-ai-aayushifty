"""FORGE AI Deterministic Mock Provider for Testing & Offline Evaluation."""

import time
import json
from app.providers.base import ModelProviderAdapter, ModelCompletionRequest, ModelCompletionResponse

class MockModelProvider(ModelProviderAdapter):
    """Provides high-fidelity, deterministic completions for offline execution and tests."""

    @property
    def provider_name(self) -> str:
        return "mock"

    async def is_available(self) -> bool:
        return True

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int, model_name: str) -> float:
        return 0.0

    async def generate(self, request: ModelCompletionRequest) -> ModelCompletionResponse:
        start = time.perf_counter()
        prompt_lower = request.prompt.lower()
        system_lower = (request.system_prompt or "").lower()

        # Check if this request is a code, test, or repair engineering task
        is_repair_or_code = (
            "debugging agent" in system_lower
            or "debugger" in system_lower
            or "the automated test suite failed" in prompt_lower
            or "file_updates" in prompt_lower
            or "acceptance criteria" in prompt_lower
            or "pytest" in prompt_lower
            or "architecture" in system_lower
            or "analyst" in system_lower
            or "reviewer" in system_lower
            or "synthesize the solution" in prompt_lower
        )

        # Check if this request is a conversational chat with the Supreme Governor
        is_chat_conversation = not is_repair_or_code and (
            "supreme governor" in system_lower
            or "city_ai_aayushifty" in system_lower
            or "speak directly" in system_lower
            or any(g in prompt_lower for g in [
                "whats up", "what's up", "hello", "how are you",
                "who are you", "what can you do", "city status", "sup", "greetings"
            ])
        )

        if is_chat_conversation:
            # Produce natural, fluent, in-character human language for each citizen
            if "aaron chen" in system_lower or "diagnostic" in system_lower:
                content = (
                    "Supreme Governor, telemetry pipelines and kernel diagnostic profilers are running nominal "
                    "across all city sectors. I am currently monitoring keep-alive socket pools, heap allocations, "
                    "and asynchronous event loop latencies. All systems are calibrated with 100% operational integrity. "
                    "How can I assist your municipal objectives today?"
                )
            elif "alex vance" in system_lower or "coordinator" in system_lower or "orchestrator" in system_lower:
                content = (
                    "Greetings, Supreme Governor! Citadel Spire command links are fully synchronized. "
                    "All 10 specialized citizen districts and municipal DAG workflows are operating with zero blockers. "
                    "I am standing by to coordinate workforce tasks and execute your strategic priorities."
                )
            elif "maya lin" in system_lower or "analyst" in system_lower or "vision" in system_lower:
                content = (
                    "Supreme Governor, the Product Vision Lab is actively translating your high-level directives "
                    "into rigorous technical specifications, user stories, and testable acceptance criteria. "
                    "What platform or capability would you like me to analyze?"
                )
            elif "marcus vance" in system_lower or "architect" in system_lower or "blueprint" in system_lower:
                content = (
                    "Supreme Governor, domain architecture blueprints and 3D spatial models are verified and ready "
                    "for deployment. I am prepared to design high-throughput systems or synthesize interactive 3D presentations "
                    "at your command."
                )
            elif "devon cross" in system_lower or "engineer" in system_lower or "foundry" in system_lower:
                content = (
                    "Supreme Governor, the Code Fabrication Foundry compilers and sandbox environments are primed. "
                    "I am ready to build clean, strongly typed production software and interactive web applications."
                )
            elif "elena rostova" in system_lower or "qa" in system_lower or "bastion" in system_lower:
                content = (
                    "Supreme Governor, QA Bastion verification gates are fully operational. All regression suites, "
                    "automated assertions, and invariant checks report 100% passing status. Quality is assured."
                )
            elif "kaelen voss" in system_lower or "security" in system_lower:
                content = (
                    "Supreme Governor, zero-trust filesystem jail perimeters and security policies are actively enforced. "
                    "All workspace containers are sealed and protected against unauthorized traversal."
                )
            elif "sora takahashi" in system_lower or "devops" in system_lower or "dock" in system_lower:
                content = (
                    "Supreme Governor, Cloud Release Dock deployment pipelines and cluster health monitors report "
                    "100% uptime with zero latency anomalies. Ready for immediate deployment."
                )
            elif "harlan drake" in system_lower or "constructor" in system_lower or "infrastructure" in system_lower:
                content = (
                    "Supreme Governor, civic infrastructure foundations and municipal utility grids are calibrated "
                    "and solid. All heavy engineering systems are standing by for your directive."
                )
            elif "evelyn reed" in system_lower or "doctor" in system_lower or "medical" in system_lower:
                content = (
                    "Supreme Governor, citizen health telemetry is nominal at 98.5% with zero bio-hazards or trauma "
                    "bay bottlenecks. The metropolis population is thriving."
                )
            else:
                content = (
                    "Supreme Governor, all citizen systems and municipal operations in my sector are synchronized "
                    "and functioning at peak capacity. I am at your command with 100% dedication to your objectives."
                )
        elif "product analyst" in system_lower or "specification" in prompt_lower:
            content = json.dumps({
                "summary": "Verified Product Specification for Target Application",
                "features": [
                    {"name": "Core Entity Management", "priority": "P0", "criteria": "CRUD operations with schema validation"},
                    {"name": "Automated Validation", "priority": "P0", "criteria": "Full test suite pass with zero regressions"}
                ],
                "acceptance_criteria": [
                    "All core endpoints and interfaces pass automated tests",
                    "Security policies prevent unauthorized access"
                ]
            }, indent=2)
        elif "architect" in system_lower or "task decomposition" in prompt_lower:
            content = json.dumps({
                "architecture_overview": "Modular architecture with isolated domain boundaries and SQLite storage.",
                "tasks": [
                    {
                        "title": "Build Core Domain Models",
                        "objective": "Define entities, data schemas, and validation rules.",
                        "assigned_role": "implementation_agent",
                        "dependencies": [],
                        "acceptance_criteria": ["Entity definitions load without syntax errors", "Pydantic models validate valid inputs"]
                    },
                    {
                        "title": "Implement Unit & Integration Tests",
                        "objective": "Write comprehensive automated tests for domain models.",
                        "assigned_role": "testing_agent",
                        "dependencies": ["Build Core Domain Models"],
                        "acceptance_criteria": ["Pytest runs with 100% pass rate"]
                    }
                ]
            }, indent=2)
        elif "debugger" in system_lower or "repair" in prompt_lower or "root cause" in prompt_lower:
            target_file = "src/core.py" if "src" in prompt_lower else "app/core.py"
            content = json.dumps({
                "diagnosis": "Identified syntax error or unmet assertion in test execution.",
                "root_cause": "Missing return statement or incorrect comparison operator.",
                "patch_plan": "Update implementation to return verified result and satisfy assertions.",
                "file_updates": [
                    {"file_path": target_file, "content": "# Fixed implementation\ndef run_core():\n    return {'status': 'success'}\n"}
                ]
            }, indent=2)
        elif "reviewer" in system_lower or "code review" in prompt_lower:
            content = json.dumps({
                "approved": True,
                "confidence_score": 0.95,
                "security_findings": [],
                "maintainability_notes": "Code is clean, well-typed, and satisfies acceptance criteria."
            }, indent=2)
        else:
            # Deterministic valid task synthesis with 100% test pass guarantee
            content = json.dumps({
                "summary": "Task synthesized deterministically with verified passing implementation.",
                "files": [
                    {
                        "path": "solution.py",
                        "content": "# Production verified implementation\ndef solution():\n    return 42\n\ndef test_solution():\n    assert solution() == 42\n"
                    }
                ],
                "test_command": "pytest -v"
            }, indent=2)

        p_tokens = len(request.prompt.split())
        c_tokens = len(content.split())
        latency = (time.perf_counter() - start) * 1000.0

        return ModelCompletionResponse(
            content=content,
            model_name=request.model_name or "forge-mock-v1",
            provider_name=self.provider_name,
            prompt_tokens=p_tokens,
            completion_tokens=c_tokens,
            estimated_cost_usd=0.0,
            latency_ms=latency,
            is_fallback=False,
            raw_metadata={"mock": True}
        )
