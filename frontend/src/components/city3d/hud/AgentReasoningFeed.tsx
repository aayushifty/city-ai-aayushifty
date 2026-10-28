import React, { useEffect, useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import { AgentReasoningStep, api } from '../../../api/client';

const STEP_STYLE: Record<string, [string, string]> = {
  plan: ['PLAN', 'text-sky-300'],
  thought: ['THINK', 'text-slate-300'],
  tool_call: ['TOOL', 'text-amber-300'],
  tool_result: ['RESULT', 'text-emerald-300'],
};

/** A citizen's live reasoning (plan, thought summaries, tool calls and results), polled while the panel is open. */
export const AgentReasoningFeed: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [steps, setSteps] = useState<AgentReasoningStep[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.getAgentReasoning(agentId, 40).then(s => { if (alive) setSteps(s); }).catch(() => { /* backend offline */ });
    load();
    const t = window.setInterval(load, 2000);
    return () => { alive = false; window.clearInterval(t); };
  }, [agentId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [steps.length]);

  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5" data-testid="agent-reasoning-feed">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
        <Brain size={12} className="text-violet-300" /> Live reasoning
      </div>
      <div className="max-h-[150px] overflow-y-auto space-y-1">
        {steps.map((s, i) => {
          const [label, color] = STEP_STYLE[s.kind] || STEP_STYLE.thought;
          return (
            <div key={`${s.at}-${i}`} className="text-[10.5px] leading-snug">
              <span className={`font-bold text-[9px] mr-1.5 ${color}`}>{label}</span>
              <span className={s.kind.startsWith('tool') ? 'font-mono text-slate-400' : 'text-slate-300'}>{s.text}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};
