"""FORGE AI Pydantic Domain Schemas."""

from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

from app.core.state_machine import TaskState

class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    PRODUCT_ANALYST = "product_analyst"
    SOFTWARE_ARCHITECT = "software_architect"
    IMPLEMENTATION_AGENT = "implementation_agent"
    TESTING_AGENT = "testing_agent"
    DEBUGGING_AGENT = "debugging_agent"
    INDEPENDENT_REVIEWER = "independent_reviewer"
    DOCUMENTATION_AGENT = "documentation_agent"

class ProjectStatus(str, Enum):
    PLANNING = "PLANNING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"

class ProjectCreate(BaseModel):
    name: str
    description: str
    budget_limit_usd: float = 25.0
    preferred_provider: str = "mock"

class Project(BaseModel):
    id: str
    name: str
    description: str
    workspace_dir: str
    status: ProjectStatus = ProjectStatus.PLANNING
    budget_limit_usd: float = 25.0
    spent_usd: float = 0.0
    total_tokens: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskCreate(BaseModel):
    project_id: str
    title: str
    objective: str
    assigned_role: AgentRole
    dependencies: List[str] = Field(default_factory=list)
    acceptance_criteria: List[str] = Field(default_factory=list)
    timeout_seconds: int = 300
    max_retries: int = 3

class VerificationEvidence(BaseModel):
    test_suite: str
    exit_code: int
    passed_tests: int = 0
    failed_tests: int = 0
    output_snippet: str = ""
    verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Task(BaseModel):
    id: str
    project_id: str
    title: str
    objective: str
    assigned_role: AgentRole
    state: TaskState = TaskState.QUEUED
    dependencies: List[str] = Field(default_factory=list)
    acceptance_criteria: List[str] = Field(default_factory=list)
    retry_count: int = 0
    max_retries: int = 3
    timeout_seconds: int = 300
    result_summary: Optional[str] = None
    verification: Optional[VerificationEvidence] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskRun(BaseModel):
    run_id: str
    task_id: str
    agent_role: AgentRole
    model_used: str
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    status: str = "RUNNING"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    logs: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None

class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class ApprovalRequest(BaseModel):
    id: str
    project_id: str
    task_id: Optional[str] = None
    action_type: str
    description: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None

class MemoryCategory(str, Enum):
    ADR = "ADR"
    TECH_SPEC = "TECH_SPEC"
    KNOWN_BUG = "KNOWN_BUG"
    USER_PREFERENCE = "USER_PREFERENCE"
    INTERFACE_CONTRACT = "INTERFACE_CONTRACT"

class ProjectMemoryEntry(BaseModel):
    id: str
    project_id: str
    category: MemoryCategory
    title: str
    content: str
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BudgetStatus(BaseModel):
    project_id: str
    allocated_usd: float
    consumed_usd: float
    total_tokens: int
    is_emergency_stopped: bool

# --- Metropolis Autonomous AI Workforce Schemas ---

class CitizenProfile(BaseModel):
    id: str
    name: str
    title: str
    profession: str
    department: str
    color: str
    assigned_model: str
    provider: str
    capabilities: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    status: str = "IDLE"  # IDLE, PLANNING, WORKING, TESTING, VERIFYING, BLOCKED, COMPLETED, FAILED
    current_task: Optional[str] = None
    active_task_id: Optional[str] = None
    work_progress: float = 0.0
    thought: Optional[str] = None
    home_building_id: str = "bld-citadel"
    workspace_dir: str = ""
    task_queue: List[str] = Field(default_factory=list)
    completed_deliverables: List[Dict[str, Any]] = Field(default_factory=list)

class CitizenChatMessageRequest(BaseModel):
    message: str
    stream: bool = False

class CitizenChatResponse(BaseModel):
    message_id: str
    agent_id: str
    agent_name: str
    reply: str
    model_used: str
    provider: str
    timestamp: str
    action_taken: Optional[str] = None
    deliverable_title: Optional[str] = None
    deliverable_url: Optional[str] = None
    deliverable_path: Optional[str] = None
    deliverable_type: Optional[str] = None
    artifact_id: Optional[str] = None

class CitizenTaskRequest(BaseModel):
    title: str
    description: str
    expected_deliverable: str
    priority: str = "HIGH"
    workspace_name: Optional[str] = None
    timeout_seconds: int = 240

class PublicMissionCreateRequest(BaseModel):
    title: str
    description: str
    category: str = "SOFTWARE"  # SOFTWARE, CONSTRUCTION, INFRASTRUCTURE, RESEARCH

class DeliverableArtifact(BaseModel):
    id: str
    task_id: str
    agent_id: str
    agent_name: str
    title: str
    relative_path: str
    file_path: str
    file_size_bytes: int = 0
    content: Optional[str] = None
    verification_exit_code: int = 0
    verification_summary: str = ""
    created_at: str
