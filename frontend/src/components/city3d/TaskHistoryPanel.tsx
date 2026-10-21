import React, { useCallback, useEffect, useState } from 'react';
import { History, X, CheckCircle2, XCircle, Ban, Loader2, ExternalLink, PencilLine } from 'lucide-react';
import { api, absoluteLink, TaskRecord } from '../../api/client';
import { REVISABLE, RevisionForm } from './hud/RevisionBox';

const RUNNING: TaskRecord['status'][] = ['QUEUED', 'PLANNING', 'WORKING', 'TESTING', 'VERIFYING', 'REPAIRING'];

const STATUS_STYLE: Record<TaskRecord['status'], string> = {
  QUEUED: 'text-slate-300 border-slate-600',
  PLANNING: 'text-sky-300 border-sky-700',
  WORKING: 'text-blue-300 border-blue-700',
  TESTING: 'text-violet-300 border-violet-700',
  VERIFYING: 'text-violet-300 border-violet-700',
  REPAIRING: 'text-amber-300 border-amber-700',
  VERIFIED: 'text-emerald-300 border-emerald-700',
  FAILED: 'text-red-300 border-red-700',
  BLOCKED: 'text-orange-300 border-orange-700',
  CANCELLED: 'text-slate-400 border-slate-700',
};

function StatusIcon({ status }: { status: TaskRecord['status'] }) {
  if (status === 'VERIFIED') return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />;
  if (status === 'FAILED') return <XCircle size={13} className="text-red-400 shrink-0" />;
  if (status === 'BLOCKED' || status === 'CANCELLED') return <Ban size={13} className="text-orange-400 shrink-0" />;
  return <Loader2 size={13} className="text-blue-400 animate-spin shrink-0" />;
}

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Every task citizens have run (chat deliverables, assigned tasks, mission subtasks) with live progress,
 * deliverable links and the real verification result. Polls faster while the panel is open.
 */
export const TaskHistoryPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.getTaskHistory(100));
    } catch {
      // Backend offline: keep the last list.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, open ? 1500 : 4000);
    return () => window.clearInterval(t);
  }, [refresh, open]);

  const running = tasks.filter(t => RUNNING.includes(t.status)).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="font-sans bg-slate-950/55 backdrop-blur-md hover:bg-slate-900/70 text-slate-100 px-3 py-1.5 rounded-2xl text-[11px] font-semibold border border-white/10 flex items-center gap-2 transition pointer-events-auto"
        title="Task history and live progress"
      >
        <History size={14} className="text-cyan-300" />
        <span>Tasks</span>
        {running > 0 && (
          <span className="bg-blue-600 text-white rounded-full px-1.5 text-[10px] font-bold">{running}</span>
        )}
      </button>

      {open && (
        <div className="fixed top-20 right-4 z-[55] w-[min(440px,calc(100vw-32px))] max-h-[calc(100vh-120px)] flex flex-col bg-[#0B1220]/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur pointer-events-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
              <History size={14} className="text-cyan-300" />
              Task history <span className="text-slate-500 font-normal">({tasks.length}, {running} running)</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" title="Close">
              <X size={14} />
            </button>
          </div>
          <div className="overflow-y-auto p-2"><TaskHistoryList tasks={tasks} /></div>
        </div>
      )}
    </>
  );
};

/** Requirements checklist of a real project: one line per requested element, pass/fail with where it is. */
const RequirementSummary: React.FC<{ t: TaskRecord; open: boolean }> = ({ t, open }) => {
  const reqs = t.requirements || [];
  const passed = reqs.filter(r => r.status === 'pass').length;
  const kindLabel: Record<string, string> = { '3d_object': '3D', '3d_scene': 'scene', page: 'page', section: 'section',
    feature: 'feature', interaction: 'interaction', content: 'content', style: 'style' };
  return (
    <div className="mt-1 text-[10px]">
      <div className={passed === reqs.length ? 'text-emerald-300' : 'text-amber-300'}>
        {passed}/{reqs.length} requirements implemented
        {t.project_files ? ` · ${t.project_files.length} files` : ''}
        {t.review?.reviewer ? ` · reviewed by ${t.review.reviewer}${t.review.approved ? ' ✓' : t.review.issues?.length ? ` (${t.review.issues.length} fixed)` : ''}` : ''}
        {!open && <span className="text-slate-500"> — tap for the checklist</span>}
      </div>
      {open && (
        <div className="mt-1 space-y-0.5">
          {reqs.map(r => (
            <div key={r.id} className="flex gap-1.5 leading-snug">
              <span className={r.status === 'pass' ? 'text-emerald-400' : 'text-red-400'}>{r.status === 'pass' ? '✓' : '✗'}</span>
              <span className="text-slate-500 shrink-0">{r.id}</span>
              <span className="text-[9px] px-1 rounded bg-white/5 text-slate-400 shrink-0 self-start">{kindLabel[r.kind] || r.kind}</span>
              <span className="text-slate-300">{r.text}<span className="text-slate-500"> — {r.evidence}</span></span>
            </div>
          ))}
          {t.review?.summary && <div className="text-slate-400 mt-1">Review: {t.review.summary}</div>}
          {t.browser && (
            <div className="mt-1 text-slate-400">
              Browser run: {t.browser.rendered ? `3D scene rendered (${t.browser.objects.length} named objects, ${t.browser.geometries.length} geometry types)` : 'no 3D scene rendered'}
              {Object.entries(t.browser.pages).map(([page, r]) => (r.errors.length || r.error) ? (
                <div key={page} className="text-red-300">{page}: {r.error || r.errors[0]}</div>
              ) : null)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** The task list itself (also shown inside the HUD phone). */
export const TaskHistoryList: React.FC<{ tasks: TaskRecord[] }> = ({ tasks }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revising, setRevising] = useState<string | null>(null);
  // a deliverable can only have one revision in progress; its newest finished version is the one to revise
  const chainBusy = (t: TaskRecord) => {
    const root = t.root_task_id || t.task_id;
    return tasks.some(o => (o.root_task_id || o.task_id) === root && RUNNING.includes(o.status));
  };
  const isLatest = (t: TaskRecord) => {
    const root = t.root_task_id || t.task_id;
    return !tasks.some(o => (o.root_task_id || o.task_id) === root && (o.version || 1) > (t.version || 1));
  };
  return (
    <div className="space-y-1.5">
      {tasks.length === 0 && <div className="text-[11px] text-slate-500 p-3 text-center">No tasks yet.</div>}
      {tasks.map(t => {
        const isRunning = RUNNING.includes(t.status);
        const v = t.verification;
        return (
          <div key={t.task_id} className="bg-black/40 border border-slate-800 rounded-lg p-2">
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setExpanded(e => (e === t.task_id ? null : t.task_id))}
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={t.status} />
                <span className="text-[11px] font-semibold text-slate-100 truncate flex-1">{t.title}</span>
                {(t.version || 0) > 1 && <span className="text-[9px] font-bold text-amber-300 border border-amber-700 rounded px-1">v{t.version}</span>}
                <span className={`text-[9px] font-bold border rounded px-1 ${STATUS_STYLE[t.status] || ''}`}>{t.status}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                <span className="truncate">{t.agent_name}</span>
                {t.mission_id && <span className="text-indigo-400">mission</span>}
                {v && v.repair_attempts > 0 && <span className="text-amber-400">{v.repair_attempts} repair{v.repair_attempts > 1 ? 's' : ''}</span>}
                <span className="ml-auto">{timeOf(t.created_at)}</span>
              </div>
            </button>
            {isRunning && (
              <div className="mt-1.5">
                <div className="h-1 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(3, Math.min(100, t.progress))}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{t.stage}</div>
              </div>
            )}
            {t.requirements && t.requirements.length > 0 && (
              <RequirementSummary t={t} open={expanded === t.task_id} />
            )}
            {t.feedback && (
              <div className="mt-1 text-[10px] text-amber-200/90 leading-snug line-clamp-2">
                <PencilLine size={10} className="inline mr-1 -mt-0.5" />Changes asked: {t.feedback}
              </div>
            )}
            {t.deliverables.filter(d => d.url).map(d => (
              <a
                key={d.path}
                href={absoluteLink(d.url!)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-200 truncate"
              >
                <ExternalLink size={10} className="shrink-0" />
                <span className="truncate">
                  {d.url!.includes('/revisions/') ? `v${t.version || 1} · ${d.path}` : absoluteLink(d.url!)}
                </span>
              </a>
            ))}
            {expanded === t.task_id && (
              <div className="mt-1.5 space-y-1 text-[10px]">
                {t.deliverables.filter(d => !d.url).length > 0 && (
                  <div className="text-slate-400 font-mono break-all">
                    Files: {t.deliverables.filter(d => !d.url).map(d => d.path).join(', ')}
                  </div>
                )}
                {v && (
                  <div className={v.verified ? 'text-emerald-300' : 'text-red-300'}>
                    {v.verified ? 'Verified' : 'Not verified'}: {v.passed} passed, {v.failed} failed ({v.suite})
                  </div>
                )}
                {v?.output && (
                  <pre className="font-mono text-slate-400 bg-black/60 border border-slate-800 rounded p-1.5 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{v.output}</pre>
                )}
                {t.notes.map((n, i) => (
                  <div key={i} className="text-amber-200/80">• {n}</div>
                ))}
                {t.completed_at && <div className="text-slate-500">Finished {timeOf(t.completed_at)}</div>}
              </div>
            )}
            {REVISABLE.includes(t.status) && isLatest(t) && !chainBusy(t) && (
              revising === t.task_id ? (
                <div className="mt-1.5"><RevisionForm task={t} autoFocus /></div>
              ) : (
                <button type="button" onClick={() => setRevising(t.task_id)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 hover:text-amber-200">
                  <PencilLine size={11} /> Request changes
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};
