import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileCode, RotateCw, Save, Send, TerminalSquare, X } from 'lucide-react';
import { api, RunningApp } from '../../../api/client';

interface TermLine { cmd: string; out: string; code: number }

/** Agentic IDE over a running delivered app: file tree, editor with diffs, terminal, live preview and ask-an-agent. */
export const IdeView: React.FC<{ app: RunningApp; onClose: () => void }> = ({ app, onClose }) => {
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [diff, setDiff] = useState('');
  const [error, setError] = useState('');
  const [cmd, setCmd] = useState('');
  const [term, setTerm] = useState<TermLine[]>([]);
  const [running, setRunning] = useState(false);
  const [ask, setAsk] = useState('');
  const [askStatus, setAskStatus] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [url, setUrl] = useState(app.url);
  const termEnd = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(() => {
    api.appFiles(app.id).then(setFiles).catch(e => setError(String(e.message || e)));
  }, [app.id]);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { termEnd.current?.scrollIntoView({ block: 'end' }); }, [term]);

  const open = async (path: string) => {
    setError(''); setDiff('');
    try {
      const text = await api.appFile(app.id, path);
      setCurrent(path); setContent(text); setSaved(text);
    } catch (e: any) { setError(e.message || String(e)); }
  };

  const save = async () => {
    if (!current) return;
    setError('');
    try {
      const res = await api.saveAppFile(app.id, current, content);
      setSaved(content);
      setDiff(res.changed ? res.diff : 'No changes.');
      if (app.kind === 'fastapi' && current.endsWith('.py')) {
        const rec = await api.appAction(app.id, 'restart');
        setUrl(rec.url);
      }
      setPreviewKey(k => k + 1);
      loadFiles();
    } catch (e: any) { setError(e.message || String(e)); }
  };

  const runCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmd.trim() || running) return;
    const c = cmd; setCmd(''); setRunning(true);
    try {
      const r = await api.appTerminal(app.id, c);
      setTerm(t => [...t, { cmd: c, out: (r.stdout || '') + (r.stderr || ''), code: r.exit_code }]);
    } catch (err: any) {
      setTerm(t => [...t, { cmd: c, out: err.message || String(err), code: -1 }]);
    } finally { setRunning(false); loadFiles(); }
  };

  const askAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    setAskStatus('Opening a ticket…');
    try {
      const r = await api.askAgentToChange(app.id, ask);
      setAskStatus(`Ticket ${r.task_id || r.id || ''} opened: the agent is on it. Follow its reasoning in chat.`);
      setAsk('');
    } catch (err: any) { setAskStatus(err.message || String(err)); }
  };

  const restart = async () => {
    const rec = await api.appAction(app.id, 'restart').catch(() => null);
    if (rec) setUrl(rec.url);
    setPreviewKey(k => k + 1);
  };

  const dirty = current !== null && content !== saved;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto" data-testid="ide-view">
      <div className="w-full h-full max-w-[1600px] bg-slate-950 border border-slate-700 rounded-xl flex flex-col overflow-hidden text-slate-200 text-xs">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800">
          <FileCode size={14} className="text-amber-300" />
          <span className="font-semibold">{app.name}</span>
          <span className="text-slate-500">{app.kind} · {url}</span>
          <button onClick={restart} className="ml-auto flex items-center gap-1 text-slate-300 hover:text-white" data-testid="ide-restart"><RotateCw size={12} /> Restart</button>
          <button onClick={onClose} className="text-slate-400 hover:text-white" data-testid="ide-close"><X size={16} /></button>
        </div>
        <div className="flex-1 grid grid-cols-[200px_1fr_1fr] min-h-0">
          <div className="border-r border-slate-800 overflow-auto py-1" data-testid="ide-files">
            {files.map(f => (
              <button key={f.path} onClick={() => open(f.path)} title={`${f.size} bytes`}
                className={`block w-full text-left px-3 py-0.5 truncate hover:bg-slate-800 ${current === f.path ? 'bg-slate-800 text-amber-200' : ''}`}>
                {f.path}
              </button>
            ))}
          </div>
          <div className="flex flex-col min-h-0 border-r border-slate-800">
            <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-800">
              <span className="truncate">{current ?? 'Pick a file'}{dirty ? ' •' : ''}</span>
              <button onClick={save} disabled={!current} data-testid="ide-save"
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 disabled:opacity-40"><Save size={12} /> Save</button>
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)} spellCheck={false} disabled={!current}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }}
              className="flex-1 min-h-0 bg-slate-900 p-2 font-mono text-[12px] outline-none resize-none" data-testid="ide-editor" />
            {error && <div className="px-2 py-1 text-red-400">{error}</div>}
            {diff && (
              <pre className="max-h-40 overflow-auto bg-black/60 p-2 font-mono text-[11px] border-t border-slate-800" data-testid="ide-diff">
                {diff.split('\n').map((l, i) => (
                  <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'text-emerald-400' : l.startsWith('-') && !l.startsWith('---') ? 'text-red-400' : 'text-slate-400'}>{l || ' '}</div>
                ))}
              </pre>
            )}
          </div>
          <div className="flex flex-col min-h-0">
            <iframe key={previewKey} src={url ?? 'about:blank'} title="Live preview" className="flex-1 min-h-0 bg-white" data-testid="ide-preview" />
            <div className="h-40 flex flex-col border-t border-slate-800 bg-black/70">
              <div className="flex-1 overflow-auto p-2 font-mono text-[11px]" data-testid="ide-terminal">
                {term.map((t, i) => (
                  <div key={i}><span className="text-sky-400">PS&gt; {t.cmd}</span>
                    <pre className={`whitespace-pre-wrap ${t.code === 0 ? 'text-slate-300' : 'text-red-300'}`}>{t.out}</pre></div>
                ))}
                <div ref={termEnd} />
              </div>
              <form onSubmit={runCommand} className="flex items-center gap-1 border-t border-slate-800 px-2 py-1">
                <TerminalSquare size={12} className="text-slate-500" />
                <input value={cmd} onChange={e => setCmd(e.target.value)} placeholder={running ? 'Running…' : 'Command (runs in the app folder)'}
                  className="flex-1 bg-transparent outline-none font-mono" data-testid="ide-terminal-input" />
              </form>
            </div>
          </div>
        </div>
        <form onSubmit={askAgent} className="flex items-center gap-2 px-3 py-2 border-t border-slate-800">
          <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask an agent to change something… (opens a ticket)"
            className="flex-1 bg-slate-900 rounded px-2 py-1 outline-none" data-testid="ide-ask-input" />
          <button type="submit" className="flex items-center gap-1 px-2 py-1 rounded bg-sky-500/20 text-sky-200" data-testid="ide-ask"><Send size={12} /> Ask</button>
          {askStatus && <span className="text-slate-400 truncate max-w-[40%]" data-testid="ide-ask-status">{askStatus}</span>}
        </form>
      </div>
    </div>
  );
};
