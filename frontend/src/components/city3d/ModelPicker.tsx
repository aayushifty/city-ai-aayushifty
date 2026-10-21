import React, { useEffect, useMemo, useState } from 'react';
import { api, ModelCatalogEntry } from '../../api/client';

interface ModelPickerProps {
  agentId: string;
  currentModel: string;
  onChanged: (model: string, providerLabel: string) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  freellm: 'FreeLLM gateway', ollama: 'Local (Ollama)', groq: 'Groq (free tier)', openrouter: 'OpenRouter (free)',
  gemini: 'Gemini (free tier)', openai: 'OpenAI',
};

/**
 * Lets you switch the model a citizen thinks with. "Automatic" keeps the citizen on the FreeLLM gateway (a strong
 * model for its role) while the gateway is reachable and on its own local model otherwise; picking a model pins it.
 */
export const ModelPicker: React.FC<ModelPickerProps> = ({ agentId, currentModel, onChanged }) => {
  const [options, setOptions] = useState<ModelCatalogEntry[]>([]);
  const [gateway, setGateway] = useState<{ online: boolean; model_count: number; error?: string | null } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

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
        setGateway(res.freellm || null);
      })
      .catch(() => alive && setStatus('Model list unavailable (backend offline)'));
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const shown = options.filter(o => !q || o.model.toLowerCase().includes(q) || o.provider === 'ollama');
    const by: Record<string, ModelCatalogEntry[]> = {};
    shown.forEach(o => { (by[o.provider] = by[o.provider] || []).push(o); });
    return Object.entries(by).sort(([a], [b]) => (a === 'freellm' ? -1 : b === 'freellm' ? 1 : a.localeCompare(b)));
  }, [options, filter]);

  const change = async (value: string) => {
    const [provider, ...rest] = value.split('|');
    const model = rest.join('|');
    setStatus('Switching...');
    try {
      const c = await api.setAgentModel(agentId, provider, model);
      onChanged(c?.assigned_model || model, c?.provider || PROVIDER_LABEL[provider] || provider);
      setStatus(provider === 'auto' ? 'Automatic: FreeLLM gateway when reachable, local model otherwise' : null);
    } catch (e: any) {
      setStatus(e?.message || 'Switch failed');
    }
  };

  const selected = options.find(o => o.model === currentModel);
  const freellmCount = options.filter(o => o.provider === 'freellm').length;

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
          <option value="auto|">Automatic (FreeLLM gateway when reachable, else local)</option>
          {groups.map(([provider, list]) => (
            <optgroup key={provider} label={`${PROVIDER_LABEL[provider] || provider}${provider === 'freellm' ? ` — ${list.length} models` : ''}`}>
              {list.map(o => (
                <option key={`${o.provider}|${o.model}`} value={`${o.provider}|${o.model}`} disabled={!o.ready}>
                  {o.label}{o.ready ? '' : o.provider === 'ollama' ? ' (not installed)' : ' (add API key)'}{o.strength ? ` — ${o.strength}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {freellmCount > 20 && (
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={`Filter ${freellmCount} gateway models (e.g. coder, 70b, deepseek)`}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
      )}
      {gateway && (
        <span className={gateway.online ? 'text-emerald-300' : 'text-amber-300'}>
          FreeLLM gateway: {gateway.online ? `online, ${gateway.model_count} models` : `not in use — ${gateway.error || 'unreachable'}`}
        </span>
      )}
      {status && <span className="text-slate-400">{status}</span>}
      {selected && !selected.ready && selected.provider === 'ollama' && (
        <span className="text-amber-300">Install with: <code className="font-mono">ollama pull {selected.model}</code></span>
      )}
    </div>
  );
};
