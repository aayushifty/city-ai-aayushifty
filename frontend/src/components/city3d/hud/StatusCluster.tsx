import React from 'react';
import { Activity, CheckCircle2, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { RUNNING_TASK_STATUSES, useLiveData } from './useCityLiveData';

/** Compact top-bar indicators, all counted from live backend data. */
export const StatusCluster: React.FC = () => {
  const live = useLiveData();
  const running = live.tasks.filter(t => RUNNING_TASK_STATUSES.includes(t.status)).length;
  const verified = live.tasks.filter(t => t.status === 'VERIFIED').length;
  const failed = live.tasks.filter(t => t.status === 'FAILED').length;
  const approvals = live.approvals.length;

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
      <span
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${live.online ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-red-500/40 text-red-300 bg-red-500/10'}`}
        title={live.online ? 'Backend connected' : 'Backend not reachable'}
      >
        {live.online ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span className="hidden lg:inline">{live.online ? 'Live' : 'Offline'}</span>
      </span>
      {live.online && (
        <>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 bg-blue-500/10" title="Tasks running now">
            <Activity size={12} className={running ? 'animate-pulse' : ''} />{running}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                title={`Verified deliverables in task history${failed ? ` (${failed} failed)` : ''}`}>
            <CheckCircle2 size={12} />{verified}
            {failed > 0 && <span className="text-red-300 ml-0.5">/ {failed}✕</span>}
          </span>
          {approvals > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-400/60 text-amber-200 bg-amber-500/15 animate-pulse" title="Host actions waiting for your approval">
              <ShieldAlert size={12} />{approvals}
            </span>
          )}
        </>
      )}
    </div>
  );
};
