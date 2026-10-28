import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { absoluteLink, api, BoardColumn, BoardTicket, MissionBoard } from '../../../api/client';

const COLUMNS: { key: BoardColumn; label: string; tone: string }[] = [
  { key: 'backlog', label: 'Backlog', tone: 'text-slate-300' },
  { key: 'in_progress', label: 'In progress', tone: 'text-sky-300' },
  { key: 'review', label: 'QA review', tone: 'text-teal-300' },
  { key: 'done', label: 'Done', tone: 'text-emerald-300' },
];

const ROLE_TONE: Record<string, string> = {
  'CEO/PM': 'bg-amber-500/20 text-amber-200', PM: 'bg-amber-500/15 text-amber-200', Research: 'bg-violet-500/20 text-violet-200',
  Design: 'bg-pink-500/20 text-pink-200', Frontend: 'bg-sky-500/20 text-sky-200', Backend: 'bg-indigo-500/20 text-indigo-200',
  QA: 'bg-teal-500/20 text-teal-200', DevOps: 'bg-orange-500/20 text-orange-200', Security: 'bg-red-500/20 text-red-200',
};

const Ticket: React.FC<{ t: BoardTicket }> = ({ t }) => (
  <div data-testid="kanban-ticket" data-status={t.status}
    className={`rounded-md border px-2 py-1.5 bg-white/[0.03] ${t.final ? 'border-emerald-400/50' : 'border-white/10'}`}>
    <div className="flex items-center gap-1 mb-0.5">
      <span className={`px-1.5 rounded text-[9.5px] font-bold ${ROLE_TONE[t.role] || 'bg-white/10 text-slate-200'}`}>{t.role}</span>
      <span className="text-[10px] text-slate-400 truncate">{t.assignee}</span>
      {t.url && (
        <a href={absoluteLink(t.url)} target="_blank" rel="noreferrer" className="ml-auto text-cyan-300 hover:text-cyan-200" title="Open">
          <ExternalLink size={11} />
        </a>
      )}
    </div>
    <div className="text-[11px] text-slate-100 leading-snug line-clamp-2">{t.title}</div>
    {t.status === 'WORKING' && (
      <div className="mt-1 h-1 rounded bg-white/10 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${t.progress}%` }} /></div>
    )}
    {t.qa && (
      <div data-testid="kanban-qa" className={`mt-1 flex items-start gap-1 text-[10px] ${t.qa.approved ? 'text-emerald-300' : 'text-orange-300'}`}>
        {t.qa.approved ? <ShieldCheck size={11} className="shrink-0 mt-px" /> : <ShieldAlert size={11} className="shrink-0 mt-px" />}
        <span className="line-clamp-2">{t.qa.approved ? 'QA signed off' : `QA round ${t.qa.round}: ${t.qa.notes}`}</span>
      </div>
    )}
    {t.qa_history.length > 0 && t.qa?.approved && (
      <div className="text-[9.5px] text-slate-500 mt-0.5">{t.qa_history.length} rework round{t.qa_history.length === 1 ? '' : 's'}</div>
    )}
    {t.error && <div className="mt-1 text-[10px] text-red-300 line-clamp-2">{t.error}</div>}
  </div>
);

/** The mission's tickets across backlog, in progress, QA review and done; failed tickets show under Done in red. */
export const MissionKanban: React.FC<{ missionId: string }> = ({ missionId }) => {
  const [board, setBoard] = useState<MissionBoard | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.getMissionBoard(missionId).then(b => { if (alive) setBoard(b); }).catch(() => {});
    load();
    const id = window.setInterval(load, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, [missionId]);

  if (!board) return <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-white/10">Loading board…</div>;
  const total = COLUMNS.reduce((n, c) => n + board.columns[c.key].length, 0) + board.columns.blocked.length;
  return (
    <div data-testid="mission-kanban" className="border-b border-white/10 px-3 py-2 max-h-[45%] overflow-y-auto">
      <div className="text-[10.5px] text-slate-400 mb-1.5 flex items-center gap-1">
        <CheckCircle2 size={11} className="text-amber-300" />
        Tickets planned by the {board.lead.role} · {board.columns.done.length}/{total} signed off
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {COLUMNS.map(c => {
          const items = c.key === 'done' ? [...board.columns.done, ...board.columns.blocked] : board.columns[c.key];
          return (
            <div key={c.key} data-testid={`kanban-col-${c.key}`} className="min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${c.tone}`}>{c.label} <span className="text-slate-500">{items.length}</span></div>
              <div className="space-y-1.5">{items.map(t => <Ticket key={t.id} t={t} />)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
