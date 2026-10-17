import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, ShieldAlert, Flag, PlayCircle, Ban, X, ExternalLink } from 'lucide-react';
import { absoluteLink } from '../../../api/client';
import { CityLiveData, PANEL } from './useCityLiveData';

/**
 * Notifications are produced only by comparing successive backend snapshots: a task that becomes
 * VERIFIED / FAILED / BLOCKED, a task that starts, a new host-approval request, a mission that finishes.
 * The first snapshot just seeds the baseline, so old history never pops up as "new".
 */

export type HudNoticeKind = 'verified' | 'failed' | 'blocked' | 'started' | 'approval' | 'mission';

export interface HudNotice {
  id: string;
  kind: HudNoticeKind;
  title: string;
  body: string;
  url?: string | null;
  at: number;
}

const MAX_HISTORY = 40;

export function useHudNotifications(live: CityLiveData) {
  const [toasts, setToasts] = useState<HudNotice[]>([]);
  const [history, setHistory] = useState<HudNotice[]>([]);
  const seen = useRef<{ seeded: boolean; tasks: Map<string, string>; approvals: Set<string>; missions: Map<string, string> }>({
    seeded: false, tasks: new Map(), approvals: new Set(), missions: new Map(),
  });

  useEffect(() => {
    if (!live.online || !live.lastUpdated) return;
    const s = seen.current;
    const fresh: HudNotice[] = [];
    const push = (n: Omit<HudNotice, 'at'>) => fresh.push({ ...n, at: Date.now() });

    for (const t of live.tasks) {
      const before = s.tasks.get(t.task_id);
      if (s.seeded && before !== t.status) {
        const who = `${t.agent_name}: ${t.title}`;
        const url = t.deliverables.find(d => d.url)?.url;
        if (t.status === 'VERIFIED') push({ id: `${t.task_id}:v`, kind: 'verified', title: 'Deliverable verified', body: who, url });
        else if (t.status === 'FAILED') push({ id: `${t.task_id}:f`, kind: 'failed', title: 'Task failed verification', body: who, url });
        else if (t.status === 'BLOCKED') push({ id: `${t.task_id}:b`, kind: 'blocked', title: 'Subtask blocked', body: who });
        else if (before === undefined) push({ id: `${t.task_id}:s`, kind: 'started', title: 'Task started', body: who });
      }
      s.tasks.set(t.task_id, t.status);
    }
    for (const a of live.approvals) {
      if (s.seeded && !s.approvals.has(a.id)) {
        push({ id: `${a.id}:a`, kind: 'approval', title: `${a.agent_name} needs your approval`, body: a.summary || a.detail.command || a.detail.target || a.detail.path || '' });
      }
      s.approvals.add(a.id);
    }
    for (const m of live.missions) {
      const before = s.missions.get(m.id);
      if (s.seeded && before && before !== m.status && m.status !== 'IN_PROGRESS') {
        push({ id: `${m.id}:${m.status}`, kind: 'mission', title: `Mission ${m.status.toLowerCase()}`, body: m.title });
      }
      s.missions.set(m.id, m.status);
    }
    s.seeded = true;

    if (fresh.length) {
      setToasts(prev => [...fresh, ...prev].slice(0, 4));
      setHistory(prev => [...fresh, ...prev].slice(0, MAX_HISTORY));
    }
  }, [live]);

  // auto-dismiss (failures and approvals stay a little longer)
  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(n => now - n.at < (n.kind === 'failed' || n.kind === 'approval' ? 12000 : 7000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [toasts.length]);

  const dismiss = (id: string) => setToasts(prev => prev.filter(n => n.id !== id));
  return { toasts, history, dismiss };
}

export const NOTICE_META: Record<HudNoticeKind, { Icon: typeof CheckCircle2; color: string; bar: string }> = {
  verified: { Icon: CheckCircle2, color: 'text-emerald-300', bar: 'bg-emerald-400' },
  failed: { Icon: XCircle, color: 'text-red-300', bar: 'bg-red-400' },
  blocked: { Icon: Ban, color: 'text-orange-300', bar: 'bg-orange-400' },
  started: { Icon: PlayCircle, color: 'text-sky-300', bar: 'bg-sky-400' },
  approval: { Icon: ShieldAlert, color: 'text-amber-300', bar: 'bg-amber-400' },
  mission: { Icon: Flag, color: 'text-amber-300', bar: 'bg-amber-400' },
};

export const NoticeCard: React.FC<{ n: HudNotice; onDismiss?: () => void; compact?: boolean }> = ({ n, onDismiss, compact }) => {
  const meta = NOTICE_META[n.kind];
  return (
    <div className={`${compact ? 'bg-white/5 rounded-xl' : PANEL} relative overflow-hidden flex gap-2.5 p-2.5 pl-3 pointer-events-auto hud-toast-in`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${meta.bar}`} />
      <meta.Icon size={16} className={`${meta.color} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-bold ${meta.color}`}>{n.title}</div>
        <div className="text-[11px] text-slate-200 leading-snug line-clamp-2">{n.body}</div>
        {n.url && (
          <a href={absoluteLink(n.url)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-200">
            <ExternalLink size={10} /> Open deliverable
          </a>
        )}
        {compact && <div className="text-[9px] text-slate-500 mt-0.5">{new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-slate-500 hover:text-white self-start" title="Dismiss"><X size={12} /></button>
      )}
    </div>
  );
};

export const NotificationFeed: React.FC<{ toasts: HudNotice[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => (
  <div className="flex flex-col-reverse gap-2 w-[min(300px,calc(100vw-32px))]">
    {toasts.map(n => <NoticeCard key={n.id} n={n} onDismiss={() => onDismiss(n.id)} />)}
  </div>
);
