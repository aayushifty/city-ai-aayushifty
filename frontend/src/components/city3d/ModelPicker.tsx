import React, { useEffect, useState } from 'react';
import { api, ModelCatalogEntry } from '../../api/client';

interface ModelPickerProps {
  agentId: string;
  currentModel: string;
  onChanged: (model: string, providerLabel: string) => void;
}

/** Lets you switch the model a citizen thinks with: installed local Ollama models plus free cloud tiers. */
export const ModelPicker: React.FC<ModelPickerProps> = ({ agentId, currentModel, onChanged }) => {
  const [options, setOptions] = useState<ModelCatalogEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getModelCatalog()
      .then(res => {
        if (!alive) return;
        const catalog = res.free_model_catalog || [];
        // Installed Ollama models that are not in the curated catalog are offered too.
        const extra = (res.installed_models || [])
          .filter(m => !m.name.includes('embed') && !catalog.some(c => c.model === m.name))
          .map(m => ({ provider: 'ollama', model: m.name, label: m.name, strength: 'Installed locally', size_gb: 0, installed: true, ready: res.ollama_online }));
        setOptions([...catalog, ...extra]);
      })
      .catch(() => alive && setStatus('Model list unavailable (backend offline)'));
    return () => { alive = false; };
  }, []);

  const change = async (value: string) => {
    const [provider, ...rest] = value.split('|');
    const model = rest.join('|');
    setStatus('Switching...');
    try {
      await api.setAgentModel(agentId, provider, model);
      onChanged(model, provider === 'ollama' ? 'Ollama (Local)' : `${provider} (free)`);
      setStatus(null);
    } catch (e: any) {
      setStatus(e?.message || 'Switch failed');
    }
  };

  const selected = options.find(o => o.model === currentModel);

  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <label className="flex items-center gap-2">
        <span className="text-slate-400 font-semibold shrink-0">Model</span>
        <select
          value={selected ? `${selected.provider}|${selected.model}` : ''}
          onChange={e => change(e.target.value)}
          className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {!selected && <option value="">{currentModel}</option>}
          {options.map(o => (
            <option key={`${o.provider}|${o.model}`} value={`${o.provider}|${o.model}`} disabled={!o.ready}>
              {o.label}{o.ready ? '' : o.provider === 'ollama' ? ' (not installed)' : ' (add API key)'} — {o.strength}
            </option>
          ))}
        </select>
      </label>
      {status && <span className="text-slate-400">{status}</span>}
      {selected && !selected.ready && selected.provider === 'ollama' && (
        <span className="text-amber-300">Install with: <code className="font-mono">ollama pull {selected.model}</code></span>
      )}
    </div>
  );
};
