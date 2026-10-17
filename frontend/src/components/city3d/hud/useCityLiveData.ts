import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, HostApproval, TaskRecord } from '../../../api/client';

/**
 * Live backend state for the HUD: citizens, missions, task history and pending host approvals.
 * Everything here comes straight from the backend API; nothing is simulated. When the backend
 * cannot be reached, `online` is false and the panels say so instead of inventing activity.
 */

export interface LiveCitizen {
  id: string;
  name: string;
  title: string;
  profession: string;
  department: string;
  color: string;
  assigned_model: string;
  provider: string;
  status: string;                // IDLE, PLANNING, WORKING, TESTING, VERIFYING, COMPLETED, FAILED, ...
  current_task: string | null;
  active_task_id: string | null;
  work_progress: number;
  thought: string | null;
}

export interface LiveSubtask {
  id: string;
  task_id?: string;
  title: string;
  status: string;                // PENDING, QUEUED, WORKING, COMPLETED, FAILED, BLOCKED, CANCELLED
  progress: number;
  assigned_agent_id: string;
  assigned_agent_name: string;
  dependencies: string[];
  error?: string | null;
  url?: string;
}

export interface LiveMission {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;                // IN_PROGRESS, COMPLETED, PARTIAL, FAILED, CANCELLED
  progress: number;
  subtasks: LiveSubtask[];
  deliverables: string[];
  published_at: string;
  completed_at: string | null;
}

export interface CityLiveData {
  online: boolean;
  loaded: boolean;
  lastUpdated: number | null;
  citizens: LiveCitizen[];
  missions: LiveMission[];
  tasks: TaskRecord[];
  approvals: HostApproval[];
}

export const EMPTY_LIVE_DATA: CityLiveData = {
  online: false, loaded: false, lastUpdated: null, citizens: [], missions: [], tasks: [], approvals: [],
};

export const CityLiveDataContext = createContext<CityLiveData>(EMPTY_LIVE_DATA);
export const useLiveData = () => useContext(CityLiveDataContext);

const POLL_MS = 2000;

export function useCityLiveDataPoller(): CityLiveData {
  const [data, setData] = useState<CityLiveData>(EMPTY_LIVE_DATA);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const [citizens, missions, tasks, approvals] = await Promise.all([
          api.listAgents(),
          api.listPublicMissions(),
          api.getTaskHistory(60),
          api.listHostApprovals().then(r => r.pending).catch(() => [] as HostApproval[]),
        ]);
        if (alive) {
          setData({ online: true, loaded: true, lastUpdated: Date.now(), citizens, missions, tasks, approvals });
        }
      } catch {
        if (alive) setData(prev => ({ ...prev, online: false, loaded: true }));
      } finally {
        busy.current = false;
      }
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  return data;
}

// ---- shared status vocabulary --------------------------------------------------------------

export const RUNNING_TASK_STATUSES = ['QUEUED', 'PLANNING', 'WORKING', 'TESTING', 'VERIFYING', 'REPAIRING'];
export const BUSY_CITIZEN_STATUSES = ['PLANNING', 'WORKING', 'TESTING', 'VERIFYING'];

/** Colour + label for a backend status (citizen, task, subtask or mission). */
export function statusStyle(status: string | undefined): { dot: string; text: string; label: string } {
  switch ((status || '').toUpperCase()) {
    case 'PLANNING': return { dot: 'bg-sky-400', text: 'text-sky-300', label: 'Planning' };
    case 'QUEUED':
    case 'PENDING': return { dot: 'bg-slate-400', text: 'text-slate-300', label: status === 'QUEUED' ? 'Queued' : 'Pending' };
    case 'WORKING':
    case 'IN_PROGRESS': return { dot: 'bg-blue-400', text: 'text-blue-300', label: status === 'WORKING' ? 'Working' : 'In progress' };
    case 'TESTING':
    case 'VERIFYING': return { dot: 'bg-violet-400', text: 'text-violet-300', label: 'Verifying' };
    case 'REPAIRING': return { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Repairing' };
    case 'VERIFIED':
    case 'COMPLETED': return { dot: 'bg-emerald-400', text: 'text-emerald-300', label: status === 'VERIFIED' ? 'Verified' : 'Completed' };
    case 'PARTIAL': return { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Partial' };
    case 'FAILED': return { dot: 'bg-red-400', text: 'text-red-300', label: 'Failed' };
    case 'BLOCKED': return { dot: 'bg-orange-400', text: 'text-orange-300', label: 'Blocked' };
    case 'CANCELLED': return { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Cancelled' };
    case 'IDLE':
    default: return { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Idle' };
  }
}

/** Same palette as hex, for the canvas mini-map. */
export function statusHex(status: string | undefined): string {
  switch ((status || '').toUpperCase()) {
    case 'PLANNING': return '#38BDF8';
    case 'WORKING': return '#60A5FA';
    case 'TESTING':
    case 'VERIFYING': return '#A78BFA';
    case 'COMPLETED': return '#34D399';
    case 'FAILED': return '#F87171';
    case 'BLOCKED': return '#FB923C';
    default: return '#CBD5E1';
  }
}

/** Shared look for translucent HUD panels. */
export const PANEL = 'font-sans bg-slate-950/55 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]';
