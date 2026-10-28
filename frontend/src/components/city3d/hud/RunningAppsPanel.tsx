import React, { useEffect, useState } from 'react';
import { ExternalLink, Play, RotateCw, Server, Square } from 'lucide-react';
import { api, RunningApp } from '../../../api/client';

const STATUS_TONE: Record<RunningApp['status'], string> = {
  running: 'bg-emerald-400', starting: 'bg-sky-400 animate-pulse', stopped: 'bg-slate-500',
  crashed: 'bg-red-500', unhealthy: 'bg-orange-400',
};

/** Delivered projects running as live loopback servers, with open, stop and restart. Collapsed to a chip until clicked. */
export const RunningAppsPanel: React.FC<{ onOpenIde?: (app: RunningApp) => void }> = ({ onOpenIde }) => {
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.listApps().then(a => { if (alive) setApps(a); }).catch(() => {});
    load();
    const id = window.setInterval(load, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const act = async (app: RunningApp, action: 'start' | 'stop' | 'restart') => {
    setBusy(app.id);
    try {
      const rec = await api.appAction(app.id, action);
      setApps(list => list.map(a => (a.id === rec.id ? rec : a)));
    } catch { /* the next poll shows the real state */ }
    setBusy(null);
  };

  const showLogs = async (app: RunningApp) => {
    if (logs?.id === app.id) { setLogs(null); return; }
    setLogs({ id: app.id, text: await api.appLogs(app.id).catch(() => 'Logs unavailable.') });
  };

  const live = apps.filter(a => a.status === 'running').length;
  return (
    <div data-testid="running-apps" className="pointer-events-auto font-sans">
      <button onClick={() => setOpen(o => !o)} data-testid="running-apps-toggle"
        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10.5px] text-slate-200 hover:bg-black/75">
        <Server size={11} className="text-emerald-300" /> Running apps
        <span className={`rounded px-1 text-[9.5px] font-bold ${live ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-slate-400'}`}>{live}</span>
      </button>
      {open && (
        <div className="mt-1 w-[300px] max-h-[260px] overflow-y-auto rounded-md border border-white/10 bg-black/75 p-2 space-y-1.5">
          {apps.length === 0 && <div className="text-[10.5px] text-slate-500">No delivered apps yet. Finished projects start here automatically.</div>}
          {apps.map(a => (
            <div key={a.id} data-testid="running-app" data-status={a.status} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_TONE[a.status]}`} />
                <span className="text-[11px] text-slate-100 truncate" title={a.dir}>{a.name}</span>
                <span className="ml-auto text-[9.5px] text-slate-500">{a.kind}{a.port ? ` :${a.port}` : ''}</span>
              </div>
              {a.error && <div className="mt-0.5 text-[10px] text-red-300 line-clamp-2">{a.error}</div>}
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                {a.url && a.status === 'running' && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-cyan-300 hover:text-cyan-200">
                    <ExternalLink size={10} /> Open
                  </a>
                )}
                {a.status === 'running' || a.status === 'starting'
                  ? <button disabled={busy === a.id} onClick={() => act(a, 'stop')} className="flex items-center gap-0.5 text-slate-300 hover:text-white disabled:opacity-40"><Square size={10} /> Stop</button>
                  : <button disabled={busy === a.id} onClick={() => act(a, 'start')} className="flex items-center gap-0.5 text-slate-300 hover:text-white disabled:opacity-40"><Play size={10} /> Start</button>}
                <button disabled={busy === a.id} onClick={() => act(a, 'restart')} className="flex items-center gap-0.5 text-slate-300 hover:text-white disabled:opacity-40"><RotateCw size={10} /> Restart</button>
                <button onClick={() => showLogs(a)} className="text-slate-400 hover:text-white">Logs</button>
                {onOpenIde && <button onClick={() => onOpenIde(a)} data-testid="open-ide" className="ml-auto text-amber-300 hover:text-amber-200">IDE</button>}
              </div>
              {logs?.id === a.id && <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[9.5px] text-slate-400">{logs.text || '(empty)'}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
