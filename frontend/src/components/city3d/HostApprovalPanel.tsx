import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Terminal, ExternalLink, FileCode2, Check, X } from 'lucide-react';
import { api, HostApproval } from '../../api/client';

const KIND_META: Record<HostApproval['kind'], { label: string; Icon: typeof Terminal }> = {
  command: { label: 'Run command', Icon: Terminal },
  launch: { label: 'Open on desktop', Icon: ExternalLink },
  write_file: { label: 'Write file', Icon: FileCode2 },
};

/**
 * Approve/Deny queue for host actions requested by citizens. Nothing touches the computer until you
 * click Approve; requests left unanswered for 10 minutes are denied by the backend.
 */
export const HostApprovalPanel: React.FC = () => {
  const [pending, setPending] = useState<HostApproval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listHostApprovals();
      setPending(res.pending);
      setError(null);
    } catch {
      // Backend offline: keep the last list, the panel simply stays hidden when empty.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 2000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const decide = async (id: string, approved: boolean) => {
    setBusyId(id);
    try {
      await api.decideHostApproval(id, approved);
      setPending(p => p.filter(x => x.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Could not send decision');
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] w-[min(560px,calc(100vw-32px))] space-y-2 pointer-events-auto">
      <div className="flex items-center gap-2 text-[11px] font-bold text-amber-300 bg-black/70 border border-amber-500/40 rounded-lg px-3 py-1.5">
        <ShieldCheck size={14} />
        <span>{pending.length} action{pending.length > 1 ? 's' : ''} waiting for your approval</span>
      </div>
      {error && <div className="text-[11px] text-red-300 bg-red-950/70 border border-red-700/50 rounded px-3 py-1">{error}</div>}
      {pending.map(item => {
        const meta = KIND_META[item.kind] || KIND_META.command;
        const body = item.detail.command || item.detail.target || item.detail.path || '';
        return (
          <div key={item.id} className="bg-[#0B1220]/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100 min-w-0">
                <meta.Icon size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">{item.agent_name} wants to: {meta.label}</span>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{item.requested_at}</span>
            </div>
            {item.summary && item.summary !== body && (
              <div className="text-[11px] text-slate-300 mb-1.5">{item.summary}</div>
            )}
            <pre className="text-[11px] font-mono text-cyan-200 bg-black/60 border border-slate-800 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{body}</pre>
            {item.detail.cwd && <div className="text-[10px] text-slate-500 mt-1 font-mono truncate">in {item.detail.cwd}</div>}
            {item.detail.preview && (
              <pre className="text-[10px] font-mono text-slate-400 bg-black/40 border border-slate-800 rounded p-2 mt-1.5 whitespace-pre-wrap break-all max-h-28 overflow-y-auto">{item.detail.preview}</pre>
            )}
            <div className="flex gap-2 mt-2.5">
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => decide(item.id, true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition"
              >
                <Check size={14} /> Approve
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => decide(item.id, false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold transition"
              >
                <X size={14} /> Deny
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
