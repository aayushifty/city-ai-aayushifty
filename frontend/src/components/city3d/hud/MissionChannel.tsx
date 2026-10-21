import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare, X, Send, Loader2, ExternalLink, Target, AtSign } from 'lucide-react';
import { absoluteLink, api } from '../../../api/client';
import { ChannelPost, LiveMission, statusStyle, useLiveData } from './useCityLiveData';

/** Opens a mission's shared channel from anywhere in the HUD. */
export function openMissionChannel(missionId: string): void {
  window.dispatchEvent(new CustomEvent('cityai:channel', { detail: missionId }));
}

const LINK_RE = /(https?:\/\/[^\s)]+)/g;

/** Plain text with clickable links and **bold** (the only markup the backend uses). */
const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((line, i) => (
      <div key={i} className="min-h-[1em]">
        {line.split(LINK_RE).map((part, j) => /^https?:\/\//.test(part) ? (
          <a key={j} href={absoluteLink(part)} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200 underline break-all">{part}</a>
        ) : (
          part.split(/(\*\*[^*]+\*\*)/g).map((seg, k) => seg.startsWith('**') && seg.endsWith('**')
            ? <strong key={k} className="text-white">{seg.slice(2, -2)}</strong> : <React.Fragment key={k}>{seg}</React.Fragment>)
        ))}
      </div>
    ))}
  </>
);

const KIND_STYLE: Record<string, string> = {
  brief: 'border-amber-400/60 bg-amber-500/10',
  message: 'border-amber-400/40 bg-amber-500/5',
  plan: 'border-sky-400/40 bg-sky-500/5',
  final: 'border-emerald-400/70 bg-emerald-500/10',
  deliverable: 'border-emerald-400/30',
  failed: 'border-red-400/50 bg-red-500/5',
  blocked: 'border-orange-400/50 bg-orange-500/5',
  report: 'border-violet-400/50 bg-violet-500/10',
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const Post: React.FC<{ p: ChannelPost; color?: string }> = ({ p, color }) => {
  const gov = p.author_kind === 'governor';
  const sys = p.author_kind === 'system';
  return (
    <div className={`flex gap-2 ${gov ? 'flex-row-reverse' : ''}`}>
      <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white border border-white/20"
        style={{ background: gov ? '#b45309' : sys ? '#334155' : color || '#475569' }}>
        {gov ? 'G' : sys ? 'AI' : (p.author_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
      </span>
      <div className={`min-w-0 max-w-[85%] rounded-lg border px-2.5 py-1.5 ${KIND_STYLE[p.kind] || 'border-white/10 bg-white/5'}`}>
        <div className={`flex items-baseline gap-2 text-[10px] ${gov ? 'justify-end' : ''}`}>
          <span className="font-bold text-slate-200">{gov ? 'You (Governor)' : p.author_name}</span>
          <span className="text-slate-500">{timeOf(p.at)}</span>
        </div>
        <div className="text-[11.5px] text-slate-200 leading-snug break-words"><RichText text={p.text} /></div>
        {p.url && !p.text.includes(p.url) && (
          <a href={absoluteLink(p.url)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-cyan-300 hover:text-cyan-200">
            <ExternalLink size={10} /> Open
          </a>
        )}
      </div>
    </div>
  );
};

/**
 * One shared thread per mission: your briefing, the plan, every citizen's progress and deliverables, replies to
 * your messages and the final report. A message here reaches every citizen on the mission at once.
 */
export const MissionChannelPanel: React.FC<{ missionId: string; onClose: () => void }> = ({ missionId, onClose }) => {
  const live = useLiveData();
  const mission: LiveMission | undefined = live.missions.find(m => m.id === missionId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const posts = mission?.channel || [];
  const colors = useMemo(() => Object.fromEntries(live.citizens.map(c => [c.id, c.color])), [live.citizens]);
  const people = useMemo(() => {
    const ids = Array.from(new Set((mission?.subtasks || []).map(s => s.assigned_agent_id)));
    return ids.map(id => live.citizens.find(c => c.id === id)).filter(Boolean) as typeof live.citizens;
  }, [mission?.subtasks, live.citizens]);
  const finished = mission && !['IN_PROGRESS', 'PLANNING'].includes(mission.status);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [posts.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.postToMission(missionId, text.trim());
      setText('');
    } catch (err: any) {
      setError(err?.message || 'Could not reach the backend.');
    } finally {
      setBusy(false);
    }
  };

  const st = statusStyle(mission?.status);
  return (
    <div className="fixed inset-0 z-[58] bg-black/45 flex items-center justify-center p-3 pointer-events-auto font-sans" onClick={onClose}>
      <div className="w-full max-w-xl h-[min(640px,88vh)] flex flex-col bg-[#0B1220]/97 border border-amber-500/40 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2 px-3 py-2.5 border-b border-white/10">
          <MessagesSquare size={16} className="text-amber-300 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-slate-50 truncate">{mission?.title || 'Mission'}</div>
            <div className="text-[10.5px] text-slate-400 flex items-center gap-2 flex-wrap">
              <span className={st.text}>{st.label}</span>
              {mission && <span>{mission.progress}%</span>}
              <span>{people.length} citizen{people.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          {mission?.final_deliverable && (
            <a href={absoluteLink(mission.final_deliverable.url)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-[10.5px] font-bold shrink-0">
              <Target size={11} /> Open deliverable{mission.final_deliverable.version && mission.final_deliverable.version > 1 ? ` v${mission.final_deliverable.version}` : ''}
            </a>
          )}
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" title="Close"><X size={15} /></button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5">
          {!mission && <div className="text-[11px] text-slate-400 text-center p-6">This mission is no longer on the backend (it restarted).</div>}
          {mission && posts.length === 0 && <div className="text-[11px] text-slate-400 text-center p-6">No posts yet.</div>}
          {posts.map(p => <Post key={p.id} p={p} color={p.author_id ? colors[p.author_id] : undefined} />)}
        </div>

        {mission && (
          <form onSubmit={send} className="border-t border-white/10 p-2.5 space-y-1.5">
            {people.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap text-[10px] text-slate-400">
                <AtSign size={10} />
                {people.map(c => (
                  <button key={c.id} type="button" onClick={() => setText(t => `@${c.name.split(' ')[0]} ${t}`)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300">{c.name.split(' ')[0]}</button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={4000}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e as any); }}
                placeholder={finished
                  ? 'Ask the team, or "revise: …" to get a new verified version of the deliverable'
                  : 'Message everyone on this mission (steps that have not started will follow it). @Name asks one citizen.'}
                className="flex-1 bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1.5 text-[11.5px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none" />
              <button type="submit" disabled={!text.trim() || busy}
                className="self-stretch px-3 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-[11px] font-bold inline-flex items-center gap-1">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
              </button>
            </div>
            {error && <div className="text-[10.5px] text-red-300">{error}</div>}
          </form>
        )}
      </div>
    </div>
  );
};
