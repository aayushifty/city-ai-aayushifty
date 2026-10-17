import React, { useState } from 'react';
import { Users, ChevronDown, ChevronUp, WifiOff } from 'lucide-react';
import { BUSY_CITIZEN_STATUSES, LiveCitizen, PANEL, statusStyle, useLiveData } from './useCityLiveData';

/**
 * Who is doing what, from /api/agents. Collapsed it lists only citizens with work in progress;
 * expanded it lists all 15. Clicking a citizen opens 2-way comms with them.
 */
export const CitizenActivityPanel: React.FC<{ onSelectCitizen: (id: string) => void; embedded?: boolean }> = ({ onSelectCitizen, embedded }) => {
  const live = useLiveData();
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState(false);

  const busy = live.citizens.filter(c => BUSY_CITIZEN_STATUSES.includes(c.status));
  const order = (c: LiveCitizen) => (BUSY_CITIZEN_STATUSES.includes(c.status) ? 0 : c.status === 'FAILED' ? 1 : c.status === 'COMPLETED' ? 2 : 3);
  const list = (showAll ? [...live.citizens] : busy).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  return (
    <div className={embedded ? 'font-sans' : `${PANEL} pointer-events-auto w-[248px] overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2">
        <button type="button" onClick={() => setHidden(h => !h)} className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase text-cyan-300 hover:text-cyan-200">
          <Users size={13} /> Citizens
          {live.online && <span className="text-[10px] text-slate-300 font-semibold tracking-normal normal-case">{busy.length} busy / {live.citizens.length}</span>}
        </button>
        <button type="button" onClick={() => setHidden(h => !h)} className="text-slate-400 hover:text-white" title={hidden ? 'Expand' : 'Collapse'}>
          {hidden ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!hidden && (
        <div className="px-2 pb-2">
          {!live.online && live.loaded && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-300 px-1 pb-1"><WifiOff size={12} /> Backend offline: activity unavailable</div>
          )}
          {live.online && list.length === 0 && (
            <div className="text-[11px] text-slate-400 px-1 pb-1">Nobody is working right now. Walk up to a citizen and press <kbd className="px-1 rounded bg-white/10 text-amber-200">F</kbd> or assign a task.</div>
          )}
          <div className="space-y-1 max-h-[34vh] overflow-y-auto pr-0.5">
            {list.map(c => <CitizenRow key={c.id} c={c} onClick={() => onSelectCitizen(c.id)} />)}
          </div>
          {live.online && live.citizens.length > 0 && (
            <button type="button" onClick={() => setShowAll(s => !s)} className="w-full mt-1.5 text-[10px] text-slate-400 hover:text-slate-100 font-semibold">
              {showAll ? 'Show only busy citizens' : `Show all ${live.citizens.length} citizens`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const CitizenRow: React.FC<{ c: LiveCitizen; onClick: () => void }> = ({ c, onClick }) => {
  const st = statusStyle(c.status);
  const busy = BUSY_CITIZEN_STATUSES.includes(c.status);
  return (
    <button type="button" onClick={onClick} className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-white/5 transition" title={`Talk to ${c.name}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: c.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11.5px] font-bold text-slate-50 truncate">{c.name}</span>
            <span className={`ml-auto flex items-center gap-1 text-[9px] font-bold uppercase shrink-0 ${st.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${busy ? 'animate-pulse' : ''}`} />{st.label}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {c.current_task || c.profession}
          </div>
          {busy && (
            <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-400 transition-all duration-700" style={{ width: `${Math.max(3, Math.min(100, c.work_progress || 0))}%` }} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
};
