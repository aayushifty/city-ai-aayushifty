import React, { useState } from 'react';
import { Flag, ChevronDown, ChevronUp, ExternalLink, ShieldAlert, Activity, CheckCircle2, WifiOff, MessagesSquare } from 'lucide-react';
import { openMissionChannel } from './MissionChannel';
import { absoluteLink } from '../../../api/client';
import { LiveMission, PANEL, RUNNING_TASK_STATUSES, statusStyle, useLiveData } from './useCityLiveData';

/** Objective list (top right): real missions from /api/missions with their actual subtask states. */
export const MissionTracker: React.FC<{ onOpenMissions: () => void; embedded?: boolean }> = ({ onOpenMissions, embedded }) => {
  const live = useLiveData();
  const [collapsed, setCollapsed] = useState(false);

  const active = live.missions.filter(m => m.status === 'IN_PROGRESS' || m.status === 'PLANNING');
  const finished = live.missions.filter(m => m.status !== 'IN_PROGRESS').slice(0, 1);
  const shown = [...active.slice(0, 2), ...(active.length < 2 ? finished : [])];

  return (
    <div className={embedded ? 'font-sans' : `${PANEL} pointer-events-auto w-[272px] overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2">
        <button type="button" onClick={onOpenMissions} className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-amber-300 uppercase hover:text-amber-200" title="Open the mission board [M]">
          <Flag size={13} /> Missions
          {active.length > 0 && <span className="text-[10px] text-slate-300 font-semibold tracking-normal normal-case">{active.length} active</span>}
        </button>
        <button type="button" onClick={() => setCollapsed(c => !c)} className="text-slate-400 hover:text-white" title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2.5">
          {!live.online && live.loaded && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-300"><WifiOff size={12} /> Backend offline: mission status unavailable</div>
          )}
          {live.online && shown.length === 0 && (
            <button type="button" onClick={onOpenMissions} className="text-left text-[11px] text-slate-300 leading-snug hover:text-white">
              No missions yet. Press <kbd className="px-1 rounded bg-white/10 text-amber-200">M</kbd> to publish one for the citizens.
            </button>
          )}
          {shown.map(m => <MissionRow key={m.id} mission={m} onOpen={onOpenMissions} />)}
        </div>
      )}
    </div>
  );
};

const MissionRow: React.FC<{ mission: LiveMission; onOpen: () => void }> = ({ mission, onOpen }) => {
  const st = statusStyle(mission.status);
  const counts = { done: 0, failed: 0, blocked: 0, running: 0 };
  mission.subtasks.forEach(s => {
    if (s.status === 'COMPLETED') counts.done++;
    else if (s.status === 'FAILED') counts.failed++;
    else if (s.status === 'BLOCKED') counts.blocked++;
    else if (RUNNING_TASK_STATUSES.includes(s.status)) counts.running++;
  });
  const current = mission.subtasks.filter(s => RUNNING_TASK_STATUSES.includes(s.status)).slice(0, 2);
  const links = mission.subtasks.filter(s => s.url).slice(0, 2);

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[12px] font-bold text-slate-50 leading-tight line-clamp-2">{mission.title}</span>
          <span className={`text-[9px] font-bold uppercase shrink-0 mt-0.5 ${st.text}`}>{st.label}</span>
        </div>
      </button>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${mission.status === 'FAILED' ? 'bg-red-400' : mission.status === 'PARTIAL' ? 'bg-amber-400' : 'bg-gradient-to-r from-amber-400 to-emerald-400'} transition-all duration-700`}
             style={{ width: `${Math.max(0, Math.min(100, mission.progress))}%` }} />
      </div>
      <div className="flex items-center gap-2.5 text-[10px] text-slate-300">
        <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-400" />{counts.done}/{mission.subtasks.length}</span>
        {counts.running > 0 && <span className="flex items-center gap-1"><Activity size={10} className="text-blue-400" />{counts.running} running</span>}
        {counts.failed > 0 && <span className="text-red-300">{counts.failed} failed</span>}
        {counts.blocked > 0 && <span className="flex items-center gap-1 text-orange-300"><ShieldAlert size={10} />{counts.blocked} blocked</span>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => openMissionChannel(mission.id)}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 hover:text-amber-200">
          <MessagesSquare size={11} /> Channel{mission.channel?.length ? ` (${mission.channel.length})` : ''}
        </button>
        {mission.final_deliverable && (
          <a href={absoluteLink(mission.final_deliverable.url)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:text-emerald-200">
            <ExternalLink size={10} /> Deliverable
          </a>
        )}
      </div>
      {current.map(s => (
        <div key={s.id} className="flex items-center gap-1.5 text-[10px] text-slate-200">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${statusStyle(s.status).dot}`} />
          <span className="truncate">{s.assigned_agent_name}: {s.title}</span>
        </div>
      ))}
      {links.map(s => (
        <a key={s.id} href={absoluteLink(s.url!)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-200 truncate">
          <ExternalLink size={10} className="shrink-0" /><span className="truncate">{s.title}</span>
        </a>
      ))}
    </div>
  );
};
