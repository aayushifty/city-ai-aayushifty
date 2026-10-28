import { Project, Task, ApprovalRequest, ProjectMemoryEntry, BudgetStatus } from '../types';

const API_BASE = '/api';

export interface ModelCatalogEntry {
  provider: string;
  model: string;
  label: string;
  strength: string;
  size_gb: number;
  installed: boolean;
  ready: boolean;
}

export interface HostApproval {
  id: string;
  agent_id: string;
  agent_name: string;
  kind: 'command' | 'launch' | 'write_file';
  summary: string;
  detail: { command?: string; cwd?: string; target?: string; path?: string; preview?: string };
  task_id?: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  requested_at: string;
}

/** Turns a backend-relative link (/api/..., /deliverables/...) into a full URL you can open or share. */
export interface TaskRecord {
  task_id: string;
  agent_id: string;
  agent_name: string;
  title: string;
  kind: 'TASK' | 'CHAT' | 'MISSION_SUBTASK' | 'REVISION';
  mission_id: string | null;
  status: 'QUEUED' | 'PLANNING' | 'WORKING' | 'TESTING' | 'VERIFYING' | 'REPAIRING' | 'VERIFIED' | 'FAILED' | 'BLOCKED' | 'CANCELLED';
  progress: number;
  stage: string;
  deliverables: { path: string; url: string | null; title: string | null }[];
  verification: {
    verified: boolean;
    suite: string;
    exit_code: number;
    passed: number;
    failed: number;
    repair_attempts: number;
    output: string;
  } | null;
  notes: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // revisions ("Request changes"): every version of a deliverable shares root_task_id; the original is v1
  version?: number;
  revision_of?: string;
  root_task_id?: string;
  base_title?: string;
  feedback?: string;
  // real projects: every requested element as a checked requirement, and the second citizen's review
  requirements?: { id: string; kind: string; text: string; name: string; status: 'pass' | 'fail' | 'pending'; evidence: string }[];
  review?: { reviewer: string | null; approved: boolean | null; summary?: string; issues: { requirement?: string; file?: string; problem: string }[]; fixed_after_review?: boolean };
  project_files?: string[];
  browser?: { rendered: boolean | null; objects: string[]; geometries: string[];
              pages: Record<string, { errors: string[]; frames: number; meshes: number; error?: string | null }> } | null;
}

export function absoluteLink(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/deliverables/')) return `http://127.0.0.1:8000${url}`;
  return `${window.location.origin}${url}`;
}

export interface BoardTicket {
  id: string;
  task_id: string;
  title: string;
  status: string;
  assignee_id: string;
  assignee: string;
  role: string;
  progress: number;
  qa: { approved: boolean; notes: string; round: number; reviewer: string } | null;
  qa_history: string[];
  url: string | null;
  error: string | null;
  final: boolean;
}

export type BoardColumn = 'backlog' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface MissionBoard {
  mission_id: string;
  title: string;
  status: string;
  lead: { id: string; role: string };
  columns: Record<BoardColumn, BoardTicket[]>;
}

export interface RunningApp {
  id: string;
  task_id: string;
  name: string;
  dir: string;
  kind: 'fastapi' | 'node' | 'static';
  port: number | null;
  url: string | null;
  status: 'starting' | 'running' | 'stopped' | 'crashed' | 'unhealthy';
  pid: number | null;
  started_at: string | null;
  error: string | null;
}

export interface AgentReasoningStep {
  agent_id: string;
  agent_name: string;
  role: string;
  task_id: string | null;
  mission_id: string | null;
  kind: 'plan' | 'thought' | 'tool_call' | 'tool_result';
  text: string;
  at: string;
}

export const api = {
  // Projects
  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  },

  async createProject(name: string, description: string, budgetLimitUsd: number = 25.0): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, budget_limit_usd: budgetLimitUsd })
    });
    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
  },

  async startAutonomousPipeline(projectId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/execute`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start pipeline');
  },

  // Tasks
  async listTasks(projectId: string): Promise<Task[]> {
    const res = await fetch(`${API_BASE}/tasks/project/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async retryTask(taskId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/retry`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to retry task');
  },

  // Approvals
  async listApprovals(projectId: string): Promise<ApprovalRequest[]> {
    const res = await fetch(`${API_BASE}/approvals/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch approvals');
    return res.json();
  },

  async decideApproval(approvalId: string, approved: boolean, note?: string): Promise<void> {
    const res = await fetch(`${API_BASE}/approvals/${approvalId}/decide?approved=${approved}${note ? `&note=${encodeURIComponent(note)}` : ''}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to decide approval');
  },

  // Memory
  async getMemory(projectId: string): Promise<ProjectMemoryEntry[]> {
    const res = await fetch(`${API_BASE}/memory/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch memory');
    return res.json();
  },

  // Budget & Global Stop
  async getBudget(projectId: string): Promise<BudgetStatus> {
    const res = await fetch(`${API_BASE}/budget/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch budget');
    return res.json();
  },

  async toggleEmergencyStop(active: boolean): Promise<{ is_emergency_stopped: boolean }> {
    const res = await fetch(`${API_BASE}/budget/emergency-stop?active=${active}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to toggle emergency stop');
    return res.json();
  },

  // --- city_ai_aayushifty Metropolis Endpoints ---

  async getModels(): Promise<{
    ollama_online: boolean;
    installed_models: any[];
    available_providers: string[];
    active_default_provider: string;
    concurrency_limit: number;
  }> {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) throw new Error('Failed to fetch model registry snapshot');
    return res.json();
  },

  async getModelCatalog(): Promise<{ ollama_online: boolean; installed_models: { name: string }[]; free_model_catalog: ModelCatalogEntry[];
    freellm?: { online: boolean; model_count: number; error?: string | null } }> {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) throw new Error('Failed to fetch model catalog');
    return res.json();
  },

  async setAgentModel(agentId: string, provider: string, model: string): Promise<any> {
    const res = await fetch(`${API_BASE}/agents/${agentId}/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Model change failed' }));
      throw new Error(err.detail || 'Model change failed');
    }
    return res.json();
  },

  async listHostApprovals(): Promise<{ pending: HostApproval[]; recent: HostApproval[] }> {
    const res = await fetch(`${API_BASE}/host-approvals`);
    if (!res.ok) throw new Error('Failed to list approvals');
    return res.json();
  },

  async getTaskHistory(limit: number = 100): Promise<TaskRecord[]> {
    const res = await fetch(`${API_BASE}/task-history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to load task history');
    return (await res.json()).tasks;
  },

  async decideHostApproval(id: string, approved: boolean): Promise<void> {
    const res = await fetch(`${API_BASE}/host-approvals/${id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    if (!res.ok) throw new Error('Failed to record decision');
  },

  async listAgents(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/agents`);
    if (!res.ok) throw new Error('Failed to list agents');
    return res.json();
  },

  async chatWithAgent(agentId: string, message: string): Promise<{
    message_id: string;
    agent_id: string;
    agent_name: string;
    reply: string;
    model_used: string;
    provider: string;
    timestamp: string;
    action_taken?: string;
    deliverable_title?: string;
    deliverable_url?: string;
    deliverable_path?: string;
    deliverable_type?: string;
    artifact_id?: string;
  }> {
    const res = await fetch(`${API_BASE}/agents/${agentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stream: false })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Chat request failed' }));
      throw new Error(err.detail || 'Chat request failed');
    }
    return res.json();
  },

  async openDeliverableOnComputer(artifactId: string): Promise<{ success: boolean; message: string; file_path?: string }> {
    const res = await fetch(`${API_BASE}/deliverables/open/${artifactId}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to launch deliverable on host computer');
    return res.json();
  },

  async assignAgentTask(agentId: string, task: {
    title: string;
    description: string;
    expectedDeliverable: string;
    priority?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/agents/${agentId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        expected_deliverable: task.expectedDeliverable,
        priority: task.priority || 'HIGH'
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Task assignment failed' }));
      throw new Error(err.detail || 'Task assignment failed');
    }
    return res.json();
  },

  async getArtifact(taskId: string): Promise<{
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
  }> {
    const res = await fetch(`${API_BASE}/artifacts/${taskId}`);
    if (!res.ok) throw new Error('Deliverable artifact not found');
    return res.json();
  },

  async publishPublicMission(mission: {
    title: string;
    description: string;
    category?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: mission.title,
        description: mission.description,
        category: mission.category || 'SOFTWARE'
      })
    });
    if (!res.ok) throw new Error('Failed to publish public mission');
    return res.json();
  },

  async listPublicMissions(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/missions`);
    if (!res.ok) throw new Error('Failed to list public missions');
    return res.json();
  },

  /** The user guide (docs/USER_GUIDE.md) as Markdown. */
  async getGuide(): Promise<string> {
    const res = await fetch(`${API_BASE}/guide`);
    if (!res.ok) throw new Error('Guide not available');
    return (await res.json()).markdown;
  },

  /** A citizen's live reasoning feed: plan, thought summaries, tool calls and results (newest last). */
  async getAgentReasoning(agentId: string, limit = 50): Promise<AgentReasoningStep[]> {
    const res = await fetch(`${API_BASE}/agents/${agentId}/reasoning?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch reasoning');
    return (await res.json()).steps;
  },

  /** Delivered projects running as live loopback servers, newest first. */
  async listApps(): Promise<RunningApp[]> {
    const res = await fetch(`${API_BASE}/apps`);
    if (!res.ok) throw new Error('Failed to fetch running apps');
    return res.json();
  },

  async appAction(appId: string, action: 'start' | 'stop' | 'restart'): Promise<RunningApp> {
    const res = await fetch(`${API_BASE}/apps/${appId}/${action}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to ${action} app`);
    return res.json();
  },

  async appLogs(appId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/apps/${appId}/logs`);
    if (!res.ok) throw new Error('Failed to fetch app logs');
    return res.text();
  },

  /** The mission's tickets as a kanban, each with its role, assignee and QA verdict. */
  async getMissionBoard(missionId: string): Promise<MissionBoard> {
    const res = await fetch(`${API_BASE}/missions/${missionId}/board`);
    if (!res.ok) throw new Error('Failed to fetch board');
    return res.json();
  },

  /** Write once to everyone on a mission (its shared channel). */
  async postToMission(missionId: string, text: string): Promise<void> {
    const res = await fetch(`${API_BASE}/missions/${missionId}/channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try { detail = (await res.json()).detail || detail; } catch { /* keep the status text */ }
      throw new Error(detail);
    }
  },

  /** Request changes on a finished task: the same citizen edits its deliverable into the next version. */
  async reviseTask(taskId: string, feedback: string): Promise<{ task_id: string; version: number; title: string; agent_name: string }> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try { detail = (await res.json()).detail || detail; } catch { /* keep the status text */ }
      throw new Error(detail);
    }
    return res.json();
  },

  async cancelTask(taskId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/cancel`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to cancel task');
  },

  // --- Supreme Governor Host Computer Control ---
  async executeCommand(command: string, timeout: number = 30): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout })
    });
    if (!res.ok) throw new Error('Host command execution failed');
    return res.json();
  },

  async launchApp(target: string): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/launch-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    if (!res.ok) throw new Error('Failed to launch application on host');
    return res.json();
  },

  async readFile(path: string): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/read-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error('Failed to read host file');
    return res.json();
  },

  async writeFile(path: string, content: string): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/write-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content })
    });
    if (!res.ok) throw new Error('Failed to write host file');
    return res.json();
  },

  async listDir(path: string = '.'): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/list-dir?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to list host directory');
    return res.json();
  },

  async getDiagnostics(): Promise<any> {
    const res = await fetch(`${API_BASE}/computer/diagnostics`);
    if (!res.ok) throw new Error('Failed to fetch host system diagnostics');
    return res.json();
  }
};
