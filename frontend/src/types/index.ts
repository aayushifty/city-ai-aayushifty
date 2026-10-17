export type TaskState = 
  | 'QUEUED'
  | 'PLANNING'
  | 'READY'
  | 'RUNNING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'NEEDS_APPROVAL';

export type AgentRole =
  | 'orchestrator'
  | 'product_analyst'
  | 'software_architect'
  | 'implementation_agent'
  | 'testing_agent'
  | 'debugging_agent'
  | 'independent_reviewer'
  | 'documentation_agent';

export interface VerificationEvidence {
  test_suite: string;
  exit_code: number;
  passed_tests: number;
  failed_tests: number;
  output_snippet: string;
  verified_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  objective: string;
  assigned_role: AgentRole;
  state: TaskState;
  dependencies: string[];
  acceptance_criteria: string[];
  retry_count: number;
  max_retries: number;
  timeout_seconds: number;
  result_summary?: string;
  verification?: VerificationEvidence;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  workspace_dir: string;
  status: 'PLANNING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'STOPPED';
  budget_limit_usd: number;
  spent_usd: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  project_id: string;
  task_id?: string;
  action_type: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  decided_at?: string;
  decision_note?: string;
}

export interface ProjectMemoryEntry {
  id: string;
  project_id: string;
  category: 'ADR' | 'TECH_SPEC' | 'KNOWN_BUG' | 'USER_PREFERENCE' | 'INTERFACE_CONTRACT';
  title: string;
  content: string;
  tags: string[];
  created_at: string;
}

export interface BudgetStatus {
  project_id: string;
  allocated_usd: number;
  consumed_usd: number;
  total_tokens: number;
  is_emergency_stopped: boolean;
}

export interface ForgeTelemetryEvent {
  event_id: string;
  topic: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface DeliverableArtifact {
  id: string;
  task_id: string;
  agent_id: string;
  agent_name: string;
  title: string;
  relative_path: string;
  file_path: string;
  file_size_bytes: number;
  content: string;
  verification_exit_code: number;
  verification_summary: string;
  created_at: string;
}

export interface ModelRegistrySnapshot {
  ollama_online: boolean;
  installed_models: {
    name: string;
    model: string;
    size_bytes: number;
    modified_at: string;
    details: Record<string, any>;
    is_online: boolean;
  }[];
  available_providers: string[];
  active_default_provider: string;
  concurrency_limit: number;
}
