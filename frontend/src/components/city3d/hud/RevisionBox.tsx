import React, { useState } from 'react';
import { PencilLine, Send, X, Loader2 } from 'lucide-react';
import { api, TaskRecord } from '../../../api/client';

/** Only finished work can be revised; the backend refuses anything else (and a second revision in progress). */
export const REVISABLE: TaskRecord['status'][] = ['VERIFIED', 'FAILED'];

/**
 * "Request changes": your feedback goes to the same citizen, who edits the previous deliverable in the same
 * workspace. The result is verified again (with repair attempts) and saved as the next version; the earlier
 * version keeps its own link.
 */
export const RevisionForm: React.FC<{ task: TaskRecord; onDone?: (msg: string) => void; autoFocus?: boolean }> =
  ({ task, onDone, autoFocus }) => {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim() || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.reviseTask(task.task_id, text.trim());
        const msg = `${res.agent_name} is working on version ${res.version}. You'll be notified when it's verified.`;
        setSent(msg);
        setText('');
        onDone?.(msg);
      } catch (err: any) {
        setError(err?.message || 'Could not reach the backend.');
      } finally {
        setBusy(false);
      }
    };

    if (sent) return <div className="text-[11px] text-emerald-300 leading-snug">{sent}</div>;

    return (
      <form onSubmit={submit} className="space-y-1.5" onClick={e => e.stopPropagation()}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e as any); }}
          autoFocus={autoFocus}
          rows={3}
          maxLength={4000}
          placeholder={`What should ${task.agent_name.split(' ')[0]} change? e.g. "Make the headline shorter and add a pricing section"`}
          className="w-full bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-y"
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!text.trim() || busy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-[11px] font-bold">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send changes
          </button>
          <span className="text-[10px] text-slate-500">Saved as v{(task.version || 1) + 1} · re-verified · v{task.version || 1} stays available</span>
        </div>
        {error && <div className="text-[10px] text-red-300">{error}</div>}
      </form>
    );
  };

/** The same form as a small dialog (from a notification or the incoming call card). */
export const RevisionDialog: React.FC<{ task: TaskRecord; onClose: () => void }> = ({ task, onClose }) => (
  <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto" onClick={onClose}>
    <div className="w-full max-w-md bg-[#0B1220] border border-amber-500/40 rounded-xl shadow-2xl p-3 font-sans" onClick={e => e.stopPropagation()}>
      <div className="flex items-start gap-2 mb-2">
        <PencilLine size={16} className="text-amber-300 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-slate-100">Request changes</div>
          <div className="text-[11px] text-slate-400 truncate">{task.agent_name} · {task.base_title || task.title}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" title="Close"><X size={14} /></button>
      </div>
      <RevisionForm task={task} autoFocus onDone={() => window.setTimeout(onClose, 2200)} />
    </div>
  </div>
);
