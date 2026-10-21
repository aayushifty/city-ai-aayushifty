import React from 'react';
import { MessageSquare, Zap, ClipboardList, ScanSearch, X, ExternalLink, FileText, WifiOff, Cpu } from 'lucide-react';
import { absoluteLink } from '../../../api/client';
import { AgentCharacter } from '../../../simulation/types';
import { BUSY_CITIZEN_STATUSES, PANEL, statusStyle, useLiveData } from './useCityLiveData';

/**
 * What you can do when standing next to a citizen, and an inspect card with their real backend state.
 * Names/positions come from the 3D scene; status, task, progress, model and history come from the API.
 */

const Key: React.FC<{ k: string; tint: string }> = ({ k, tint }) => (
  <span className={`w-5 h-5 rounded-md ${tint} text-black font-black text-[11px] flex items-center justify-center shadow`}>{k}</span>
);

interface PromptProps {
  agent: AgentCharacter;
  onTalk: () => void;
  onWork: () => void;
  onAssign: () => void;
  onInspect: () => void;
}

export const InteractionPrompt: React.FC<PromptProps> = ({ agent, onTalk, onWork, onAssign, onInspect }) => {
  const live = useLiveData();
  const c = live.citizens.find(x => x.id === agent.id);
  const st = statusStyle(c?.status);
  const busy = c && BUSY_CITIZEN_STATUSES.includes(c.status);

  const actions: [string, string, string, () => void, typeof MessageSquare][] = [
    ['E', 'Talk', 'bg-emerald-400', onTalk, MessageSquare],
    ['T', 'Assign task', 'bg-sky-400', onAssign, ClipboardList],
    ['F', 'Work order', 'bg-amber-400', onWork, Zap],
    ['Q', 'Inspect', 'bg-violet-300', onInspect, ScanSearch],
  ];

  return (
    <div className={`${PANEL} hud-fade-in pointer-events-auto mt-8 px-4 py-3 w-[min(520px,calc(100vw-32px))] select-none`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0 border border-white/20" style={{ background: agent.color }}>
          {agent.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-bold text-white truncate">{agent.name}</span>
            {c ? (
              <span className={`flex items-center gap-1 text-[9px] font-bold uppercase ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${busy ? 'animate-pulse' : ''}`} />{st.label}
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase text-slate-500">{live.online ? '' : 'offline'}</span>
            )}
          </div>
          <div className="text-[10.5px] text-slate-300 truncate">
            {c?.current_task ? <>Working on: <span className="text-slate-100">{c.current_task}</span></> : agent.profession}
          </div>
        </div>
        {c && <span className="hidden sm:block text-[10px] text-slate-400 shrink-0">{c.assigned_model}</span>}
      </div>
      {busy && (
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-blue-400 transition-all duration-700" style={{ width: `${Math.max(3, Math.min(100, c!.work_progress || 0))}%` }} />
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {actions.map(([k, label, tint, fn, Icon]) => (
          <button key={k} type="button" onClick={fn}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/12 border border-white/10 text-[11px] font-semibold text-slate-100 transition">
            <Key k={k} tint={tint} /><Icon size={12} className="text-slate-300" />{label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface CardProps {
  agent: AgentCharacter;
  onClose: () => void;
  onTalk: () => void;
  onAssign: () => void;
  onWork: () => void;
}

export const CitizenInspectCard: React.FC<CardProps> = ({ agent, onClose, onTalk, onAssign, onWork }) => {
  const live = useLiveData();
  const c = live.citizens.find(x => x.id === agent.id);
  const st = statusStyle(c?.status);
  const busy = c && BUSY_CITIZEN_STATUSES.includes(c.status);
  const tasks = live.tasks.filter(t => t.agent_id === agent.id).slice(0, 6);
  const verified = live.tasks.filter(t => t.agent_id === agent.id && t.status === 'VERIFIED').length;
  const failed = live.tasks.filter(t => t.agent_id === agent.id && t.status === 'FAILED').length;

  return (
    <div className={`${PANEL} hud-fade-in pointer-events-auto w-[300px] max-h-[calc(100vh-170px)] flex flex-col overflow-hidden`}>
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2.5 border-b border-white/10" style={{ boxShadow: `inset 0 3px 0 ${agent.color}` }}>
        <span className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-black text-white shrink-0 border border-white/20" style={{ background: agent.color }}>
          {agent.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-white leading-tight">{agent.name}</div>
          <div className="text-[10.5px] text-slate-300">{c?.title || agent.title}</div>
          <div className="text-[10px] text-slate-500 truncate">{c?.department || agent.department}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" title="Close [Q / Esc]"><X size={15} /></button>
      </div>

      <div className="px-3.5 py-2.5 space-y-2.5 overflow-y-auto text-[11px]">
        {!live.online && <div className="flex items-center gap-1.5 text-red-300"><WifiOff size={12} /> Backend offline: live status unavailable</div>}
        {c && (
          <>
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1.5 font-bold uppercase text-[10px] ${st.text}`}>
                <span className={`w-2 h-2 rounded-full ${st.dot} ${busy ? 'animate-pulse' : ''}`} />{st.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400"><Cpu size={11} />{c.assigned_model} · {c.provider}</span>
            </div>
            {c.current_task ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Current task</div>
                <div className="text-slate-100">{c.current_task}</div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-blue-400 transition-all duration-700" style={{ width: `${Math.max(3, Math.min(100, c.work_progress || 0))}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{Math.round(c.work_progress || 0)}%</div>
              </div>
            ) : (
              <div className="text-slate-400">No task in progress.</div>
            )}
            {c.thought && (
              <div className="text-slate-300 italic border-l-2 border-white/15 pl-2 line-clamp-3">“{c.thought}”</div>
            )}
          </>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recent tasks</span>
            {live.online && <span className="text-[10px] text-slate-400"><span className="text-emerald-300">{verified} verified</span>{failed > 0 && <span className="text-red-300"> · {failed} failed</span>}</span>}
          </div>
          {live.online && tasks.length === 0 && <div className="text-slate-500 mt-1">No tasks recorded yet.</div>}
          <div className="mt-1 space-y-1.5">
            {tasks.map(t => {
              const ts = statusStyle(t.status);
              return (
                <div key={t.task_id} className="rounded-lg bg-white/5 px-2 py-1.5">
                  <div className="flex items-start gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${ts.dot}`} />
                    <span className="flex-1 text-slate-100 leading-snug">{t.title}</span>
                    <span className={`text-[9px] font-bold uppercase shrink-0 ${ts.text}`}>{ts.label}</span>
                  </div>
                  {t.verification && (
                    <div className="text-[10px] text-slate-400 ml-3">
                      {t.verification.passed} passed · {t.verification.failed} failed
                      {t.verification.repair_attempts > 0 && ` · ${t.verification.repair_attempts} repairs`}
                    </div>
                  )}
                  {t.deliverables.slice(0, 3).map(d => d.url ? (
                    <a key={d.path} href={absoluteLink(d.url)} target="_blank" rel="noreferrer" className="ml-3 flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-200 truncate">
                      <ExternalLink size={10} className="shrink-0" /><span className="truncate">{d.title || d.path}</span>
                    </a>
                  ) : (
                    <div key={d.path} className="ml-3 flex items-center gap-1 text-[10px] text-slate-400 truncate font-mono">
                      <FileText size={10} className="shrink-0" /><span className="truncate">{d.path}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-2.5 border-t border-white/10">
        <button type="button" onClick={onTalk} className="py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1"><MessageSquare size={12} />Talk</button>
        <button type="button" onClick={onAssign} className="py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[11px] font-bold flex items-center justify-center gap-1"><ClipboardList size={12} />Assign</button>
        <button type="button" onClick={onWork} className="py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold flex items-center justify-center gap-1" title="Sends this citizen their standard role task"><Zap size={12} />Work</button>
      </div>
    </div>
  );
};
