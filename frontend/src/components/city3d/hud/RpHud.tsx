import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Activity, ShieldAlert, Phone, PhoneOff, Send, Star, Flag, Users, MessageSquare } from 'lucide-react';
import { AgentCharacter, PlayerState } from '../../../simulation/types';
import { BUSY_CITIZEN_STATUSES, RUNNING_TASK_STATUSES, statusStyle, useLiveData } from './useCityLiveData';
import { HudNotice } from './Notifications';
import { openMissionChannel } from './MissionChannel';
import { CitizenActivityPanel } from './CitizenActivityPanel';
import { MissionTracker } from './MissionTracker';
import { FpsCounter } from './FpsCounter';

/**
 * GTA-RP style HUD pieces (original City AI branding). Every number and line here comes from the
 * backend or from what you did in this session; nothing is invented.
 */

export const COND = "font-['Bahnschrift','DIN_Alternate','Segoe_UI',sans-serif] [font-stretch:87%]";

const initials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('');

// ---- top-left badge ---------------------------------------------------------------------------

export const HudBadge: React.FC<{ location: string; showFps: boolean }> = ({ location, showFps }) => {
  const live = useLiveData();
  const busy = live.citizens.filter(c => BUSY_CITIZEN_STATUSES.includes(c.status)).length;
  return (
    <div className="flex items-start gap-2 pointer-events-auto select-none">
      <div className="w-[68px] h-[68px] rounded-full bg-gradient-to-b from-zinc-800 to-black border-[3px] border-white/15 shadow-[0_6px_24px_rgba(0,0,0,.6)] flex flex-col items-center justify-center leading-none">
        <span className={`${COND} text-[17px] font-black text-white tracking-tight`}>CITY</span>
        <span className={`${COND} text-[22px] font-black italic bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent -mt-0.5`}>AI</span>
      </div>
      <div className="flex flex-col gap-1 mt-1.5">
        <div className={`${COND} flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-black/70 border border-white/10 text-[13px] font-bold`}>
          <span className={live.online ? 'text-lime-400' : 'text-red-400'}>{live.online ? 'LIVE' : 'OFFLINE'}</span>
          <span className="flex items-center gap-1 text-lime-300"><Users size={12} />{live.online ? `${busy}/${live.citizens.length}` : '—'}</span>
          {showFps && <FpsCounter />}
        </div>
        <div className={`${COND} px-2.5 py-0.5 rounded-md bg-black/60 border border-white/10 text-[13px] font-semibold text-slate-100 max-w-[220px] truncate uppercase tracking-wide`}>
          {location}
        </div>
      </div>
    </div>
  );
};

// ---- key hints (clickable) --------------------------------------------------------------------

export interface KeyHint { k: string; label: string; onClick?: () => void; active?: boolean }

export const KeyHints: React.FC<{ hints: KeyHint[] }> = ({ hints }) => (
  <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 [@media(max-height:940px)]:grid-cols-2 pointer-events-auto">
    {hints.map(h => (
      <button key={h.k + h.label} type="button" onClick={h.onClick}
        className="group flex items-center gap-2.5 text-left" title={`${h.label} [${h.k}]`}>
        <span className={`${COND} min-w-[26px] h-[26px] px-1 rounded-[5px] flex items-center justify-center text-[13px] font-bold border shadow
          ${h.active ? 'bg-amber-400 text-black border-amber-300' : 'bg-black/75 text-white border-white/20 group-hover:border-amber-300/70'}`}>{h.k}</span>
        <span className={`${COND} text-[15px] font-semibold text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] group-hover:text-amber-200`}>{h.label}</span>
      </button>
    ))}
  </div>
);

// ---- objective card -----------------------------------------------------------------------------

export const ObjectiveCard: React.FC<{ agents: AgentCharacter[]; player: PlayerState; onOpenMissions: () => void; onTalk: (id: string) => void }> =
  ({ agents, player, onOpenMissions, onTalk }) => {
    const live = useLiveData();
    // focus: the first running mission subtask, else the most recent running task
    const mission = live.missions.find(m => m.status === 'IN_PROGRESS' || m.status === 'PLANNING');
    const sub = mission?.subtasks.find(s => RUNNING_TASK_STATUSES.includes(s.status));
    const task = live.tasks.find(t => RUNNING_TASK_STATUSES.includes(t.status));
    const agentId = sub?.assigned_agent_id || task?.agent_id;
    const agentName = sub?.assigned_agent_name || task?.agent_name;
    const title = mission ? mission.title : task ? task.title : null;
    const detail = sub ? `${sub.assigned_agent_name}: ${sub.title}` : task ? `${task.agent_name} · ${task.stage || statusStyle(task.status).label}` : null;
    const ag = agents.find(a => a.id === agentId);
    const dist = ag ? Math.round(Math.hypot(ag.x - player.x, ag.z - player.z) / 1.4) : null;   // 1.4 units = 1 m
    const color = ag?.color || '#F59E0B';

    if (!live.online) return null;
    return (
      <button type="button" onClick={() => (agentId ? onTalk(agentId) : onOpenMissions())}
        className="pointer-events-auto flex items-center gap-3 max-w-[360px] text-left group pr-4 py-1.5 rounded-r-full bg-gradient-to-r from-black/70 via-black/45 to-transparent">
        <span className="w-[54px] h-[54px] rounded-full flex items-center justify-center text-[17px] font-black text-white shrink-0 border-2 border-white/30 shadow-[0_4px_16px_rgba(0,0,0,.6)]"
          style={{ background: title ? color : '#334155' }}>
          {agentName ? initials(agentName) : <Flag size={20} />}
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className={`${COND} text-[19px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.95)] truncate`}>{title || 'No active objective'}</span>
            {dist !== null && <span className={`${COND} text-[15px] font-bold text-amber-300 shrink-0`}>{dist}m</span>}
          </span>
          <span className="block text-[12.5px] leading-snug text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] line-clamp-2">
            {detail || <>Press <span className="text-amber-300 font-bold">M</span> to publish a mission or <span className="text-amber-300 font-bold">T</span> to assign a task.</>}
          </span>
          {mission && (
            <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); openMissionChannel(mission.id); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); openMissionChannel(mission.id); } }}
              className="mt-0.5 inline-block text-[11.5px] font-bold text-amber-300 hover:text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,.95)]">
              💬 Mission channel{mission.channel?.length ? ` (${mission.channel.length})` : ''}
            </span>
          )}
        </span>
      </button>
    );
  };

// ---- top-right counters ---------------------------------------------------------------------------

const Counter: React.FC<{ icon: React.ReactNode; value: number | string; tint: string; title: string; pulse?: boolean }> = ({ icon, value, tint, title, pulse }) => (
  <div className="flex items-center gap-2" title={title}>
    <span className={`w-9 h-9 rounded-full bg-black/80 border border-white/15 flex items-center justify-center ${tint} ${pulse ? 'animate-pulse' : ''}`}>{icon}</span>
    <span className={`${COND} text-[25px] font-bold text-white tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,.95)]`}>{value}</span>
  </div>
);

export const TopCounters: React.FC = () => {
  const live = useLiveData();
  if (!live.online) return null;
  const verified = live.tasks.filter(t => t.status === 'VERIFIED').length;
  const running = live.tasks.filter(t => RUNNING_TASK_STATUSES.includes(t.status)).length;
  return (
    <div className="flex items-center gap-5 pointer-events-auto">
      <Counter icon={<CheckCircle2 size={18} />} value={verified} tint="text-lime-400" title="Verified deliverables" />
      <Counter icon={<Activity size={18} />} value={running} tint="text-sky-400" title="Tasks running now" pulse={running > 0} />
      {live.approvals.length > 0 && <Counter icon={<ShieldAlert size={18} />} value={live.approvals.length} tint="text-amber-300" title="Host actions waiting for approval" pulse />}
    </div>
  );
};

// ---- stars + status bars at the mini-map ---------------------------------------------------------

export const ApprovalStars: React.FC = () => {
  const live = useLiveData();
  const n = Math.min(5, live.approvals.length);
  return (
    <div className="flex items-center gap-0.5 pointer-events-none" title="Host actions waiting for your approval">
      {[0, 1, 2, 3, 4].map(i => (
        <Star key={i} size={20} className={i < n ? 'text-white fill-white drop-shadow-[0_0_6px_rgba(255,255,255,.7)] animate-pulse' : 'text-white/40 fill-black/40'} strokeWidth={1.5} />
      ))}
    </div>
  );
};

export const StatusBars: React.FC = () => {
  const live = useLiveData();
  const busy = live.citizens.length ? live.citizens.filter(c => BUSY_CITIZEN_STATUSES.includes(c.status)).length / live.citizens.length : 0;
  const mission = live.missions.find(m => m.status === 'IN_PROGRESS' || m.status === 'PLANNING');
  const bars: [number, string, string][] = [
    [live.online ? 1 : 0, 'bg-lime-500', 'Backend link'],
    [busy, 'bg-sky-500', 'Citizens working'],
    [mission ? mission.progress / 100 : 0, 'bg-amber-400', 'Active mission progress'],
  ];
  return (
    <div className="grid grid-cols-3 gap-1 w-full mt-1">
      {bars.map(([v, c, t]) => (
        <div key={t} className="h-1.5 bg-black/60 rounded-sm overflow-hidden" title={t}>
          <div className={`h-full ${c} transition-all duration-700`} style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
};

// ---- right panel: feed / citizens / missions + message box -----------------------------------------

interface FeedProps {
  agents: AgentCharacter[];
  notices: HudNotice[];
  onSelectCitizen: (id: string) => void;
  onOpenMissions: () => void;
  onSendMessage: (agentId: string, text: string) => void;
}

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export const FeedPanel: React.FC<FeedProps> = ({ agents, notices, onSelectCitizen, onOpenMissions, onSendMessage }) => {
  const live = useLiveData();
  const [tab, setTab] = useState<'feed' | 'citizens' | 'missions'>('feed');
  const [collapsed, setCollapsed] = useState(false);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 5000); return () => window.clearInterval(t); }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const firstSeen = useRef(new Map<string, number>());
  const seen = (key: string) => {
    let t = firstSeen.current.get(key);
    if (t === undefined) { t = Date.now(); firstSeen.current.set(key, t); }
    return t;
  };

  // real chat replies from this session + real backend events
  const feed = useMemo(() => {
    const items: { key: string; tag: string; tagColor: string; body: string; when: string; at: number; onClick?: () => void }[] = [];
    for (const n of notices) {
      items.push({
        key: n.id, at: n.at, when: ago(n.at), body: `${n.title}: ${n.body}`,
        tag: n.kind === 'approval' ? 'Approval' : n.kind === 'mission' ? 'Mission' : 'Task',
        tagColor: n.kind === 'verified' ? '#16A34A' : n.kind === 'failed' ? '#DC2626' : n.kind === 'approval' ? '#D97706' : n.kind === 'mission' ? '#7C3AED' : '#0284C7',
      });
    }
    for (const a of agents) {
      for (const m of a.chatHistory || []) {
        // only real replies from the backend this session (they carry the model name) or real errors;
        // the local simulation's canned intro lines are not shown as messages
        if (m.sender !== 'AGENT' || String(m.id).startsWith('pending-')) continue;
        if (!String(m.senderName || '').includes('[') && !String(m.id).startsWith('err-')) continue;
        const key = `${a.id}:${m.id}`;
        items.push({ key, at: seen(key), when: m.timestamp, tag: a.name, tagColor: a.color, body: m.text, onClick: () => onSelectCitizen(a.id) });
      }
    }
    return items.sort((x, y) => y.at - x.at).slice(0, 40);
  }, [notices, agents, onSelectCitizen]);

  const citizens = live.citizens.length ? live.citizens : agents.map(a => ({ id: a.id, name: a.name }));
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const id = to || citizens[0]?.id;
    if (!id || !text.trim()) return;
    onSendMessage(id, text.trim());
    setText('');
    setTab('feed');
  };

  const tabs: [typeof tab, string, React.ReactNode][] = [['feed', 'Feed', <MessageSquare size={13} />], ['citizens', 'Citizens', <Users size={13} />], ['missions', 'Missions', <Flag size={13} />]];
  return (
    <div className="w-[360px] pointer-events-auto font-sans">
      <div className="grid grid-cols-3">
        {tabs.map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => { setTab(id); setCollapsed(false); }}
            className={`${COND} flex items-center justify-center gap-1.5 py-2 text-[14px] font-bold uppercase tracking-wide border-b-2 transition
              ${tab === id && !collapsed ? 'bg-amber-500 text-black border-amber-300' : 'bg-black/75 text-white/90 border-black/0 hover:bg-black/85'}`}>
            {icon}{label}
          </button>
        ))}
      </div>
      {!collapsed && (
        <div className="bg-gradient-to-b from-black/55 to-black/35 backdrop-blur-[2px]">
          <div ref={listRef} className="max-h-[42vh] overflow-y-auto px-3 py-2">
            {tab === 'feed' && (
              feed.length === 0
                ? <div className="text-[13px] text-white/80 py-3">Nothing yet this session. Message a citizen below or assign a task; real replies and results show up here.</div>
                : feed.map(it => (
                  <button key={it.key} type="button" onClick={it.onClick} className="block w-full text-left py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`${COND} px-1.5 py-[1px] rounded-[3px] text-[12.5px] font-bold text-white truncate max-w-[200px]`} style={{ background: it.tagColor }}>{it.tag}</span>
                      <span className="ml-auto text-[11px] text-white/70 shrink-0">{it.when}</span>
                    </div>
                    <div className="text-[13.5px] font-semibold text-white leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] line-clamp-2 mt-0.5">{it.body}</div>
                  </button>
                ))
            )}
            {tab === 'citizens' && <div className="-mx-1"><CitizenActivityPanel onSelectCitizen={onSelectCitizen} embedded /></div>}
            {tab === 'missions' && <div className="-mx-1"><MissionTracker onOpenMissions={onOpenMissions} embedded /></div>}
          </div>
          <form onSubmit={send} className="flex items-center gap-1.5 px-2 py-2 border-t border-white/10 bg-black/50">
            <select value={to} onChange={e => setTo(e.target.value)}
              className="bg-black/70 text-[12px] text-white border border-white/15 rounded px-1 py-1.5 max-w-[110px]" title="Who to message">
              {citizens.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Type your message…"
              className="flex-1 min-w-0 bg-transparent text-[13.5px] text-white placeholder-white/50 outline-none px-1" />
            <button type="submit" disabled={!text.trim()} className="text-white/80 hover:text-amber-300 disabled:opacity-40" title="Send"><Send size={16} /></button>
          </form>
        </div>
      )}
      <button type="button" onClick={() => setCollapsed(c => !c)} className="w-full text-[11px] text-white/60 hover:text-white py-0.5 bg-black/40">
        {collapsed ? 'Show panel' : 'Hide panel'}
      </button>
    </div>
  );
};

// ---- incoming call: a citizen reports a finished task -------------------------------------------------

export const IncomingCall: React.FC<{ notice: HudNotice | null; agents: AgentCharacter[]; onAccept: (agentId: string) => void; onDecline: () => void; onRevise?: (taskId: string) => void }> =
  ({ notice, agents, onAccept, onDecline, onRevise }) => {
    if (!notice) return null;
    const name = notice.body.split(':')[0];
    const ag = agents.find(a => a.name === name);
    return (
      <div className="pointer-events-auto hud-toast-in w-[360px] flex items-center gap-3 bg-black/80 border border-white/10 rounded-md px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,.6)]">
        <span className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-black text-white border-2 border-white/25 shrink-0" style={{ background: ag?.color || '#475569' }}>
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`${COND} text-[17px] font-bold text-white truncate`}>{name}</div>
          <div className="text-[12px] text-white/70 truncate">{notice.kind === 'verified' ? 'Calling: task verified' : 'Calling: task failed verification'}</div>
          {notice.taskId && onRevise && (
            <button type="button" onClick={() => onRevise(notice.taskId!)} className="text-[11px] font-semibold text-amber-300 hover:text-amber-200">
              Request changes
            </button>
          )}
        </div>
        <button type="button" onClick={() => ag && onAccept(ag.id)} className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center text-white shadow" title="Answer: open comms">
          <Phone size={18} />
        </button>
        <button type="button" onClick={onDecline} className="w-11 h-11 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white shadow" title="Decline">
          <PhoneOff size={18} />
        </button>
      </div>
    );
  };

// ---- speedometer (jet) ------------------------------------------------------------------------------------

export const Speedometer: React.FC<{ speed: number; altitude: number }> = ({ speed, altitude }) => {
  const max = 400;
  const frac = Math.max(0, Math.min(1, speed / max));
  const start = 135, sweep = 270;
  const arc = (from: number, to: number, r: number) => {
    const p = (deg: number) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div className="pointer-events-none relative w-[210px] h-[210px]">
      <svg viewBox="0 0 200 200" className="absolute inset-0 drop-shadow-[0_2px_6px_rgba(0,0,0,.8)]">
        <path d={arc(start, start + sweep, 82)} stroke="rgba(255,255,255,.18)" strokeWidth="6" fill="none" />
        <path d={arc(start, start + sweep * Math.max(0.001, frac), 82)} stroke={frac > 0.8 ? '#EF4444' : '#FACC15'} strokeWidth="6" fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map(i => {
          const deg = start + (sweep * i) / 4;
          const x = 100 + 66 * Math.cos((deg * Math.PI) / 180), y = 100 + 66 * Math.sin((deg * Math.PI) / 180);
          return <text key={i} x={x} y={y} fill="white" fontSize="15" fontWeight="700" textAnchor="middle" dominantBaseline="middle" fontStyle="italic">{i * 100}</text>;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${COND} text-[46px] font-bold text-white leading-none tabular-nums drop-shadow`}>{Math.round(speed)}</span>
        <span className={`${COND} text-[14px] font-semibold text-white/85`}>km/h</span>
        <span className={`${COND} text-[13px] text-white/75 mt-1 tabular-nums`}>ALT {Math.round(altitude)} m</span>
      </div>
    </div>
  );
};
