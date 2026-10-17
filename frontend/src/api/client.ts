import { Project, Task, ApprovalRequest, ProjectMemoryEntry, BudgetStatus } from '../types';

const API_BASE = '/api';

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
