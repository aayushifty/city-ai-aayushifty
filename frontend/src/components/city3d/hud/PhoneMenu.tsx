import React, { useEffect, useState } from 'react';
import {
  Users, Flag, ListChecks, Bell, ShieldAlert, Map as MapIcon, Camera, Settings, ChevronLeft, Plane,
  MessageSquare, Wifi, WifiOff, Smartphone,
} from 'lucide-react';
import { CameraMode } from '../../../simulation/types';
import { TaskHistoryList } from '../TaskHistoryPanel';
import { BUSY_CITIZEN_STATUSES, statusStyle, useLiveData } from './useCityLiveData';
import { HudNotice, NoticeCard } from './Notifications';

export interface HudSettings {
  minimap: boolean;
  citizens: boolean;
  missions: boolean;
  notifications: boolean;
}

export const DEFAULT_HUD_SETTINGS: HudSettings = { minimap: true, citizens: true, missions: true, notifications: true };

type AppId = 'home' | 'contacts' | 'missions' | 'tasks' | 'alerts' | 'approvals' | 'camera' | 'settings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCitizen: (id: string) => void;
  onOpenMissions: () => void;
  onOpenMap: () => void;
  cameraMode: CameraMode;
  onSelectCameraMode: (mode: CameraMode) => void;
  isPilotingJet: boolean;
  onToggleJet: (piloting: boolean) => void;
  notices: HudNotice[];
  settings: HudSettings;
  onSettingsChange: (s: HudSettings) => void;
}

/** Smartphone-style menu (bottom right, [P] or the phone button). Everything inside uses live backend data. */
export const PhoneMenu: React.FC<Props> = (props) => {
  const { open, onOpenChange } = props;
  const live = useLiveData();
  const [app, setApp] = useState<AppId>('home');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { if (!open) setApp('home'); }, [open]);

  const apps: { id: AppId | 'map'; label: string; Icon: typeof Users; tint: string; badge?: number }[] = [
    { id: 'contacts', label: 'Contacts', Icon: Users, tint: 'from-cyan-500 to-blue-600',
      badge: live.citizens.filter(c => BUSY_CITIZEN_STATUSES.includes(c.status)).length || undefined },
    { id: 'missions', label: 'Missions', Icon: Flag, tint: 'from-amber-400 to-orange-600',
      badge: live.missions.filter(m => m.status === 'IN_PROGRESS').length || undefined },
    { id: 'tasks', label: 'Tasks', Icon: ListChecks, tint: 'from-violet-500 to-fuchsia-600' },
    { id: 'alerts', label: 'Alerts', Icon: Bell, tint: 'from-rose-500 to-red-600' },
    { id: 'approvals', label: 'Approvals', Icon: ShieldAlert, tint: 'from-yellow-400 to-amber-600', badge: live.approvals.length || undefined },
    { id: 'map', label: 'Map', Icon: MapIcon, tint: 'from-emerald-500 to-teal-600' },
    { id: 'camera', label: 'Camera', Icon: Camera, tint: 'from-slate-500 to-slate-700' },
    { id: 'settings', label: 'Settings', Icon: Settings, tint: 'from-zinc-500 to-zinc-700' },
  ];

  const title: Record<AppId, string> = {
    home: '', contacts: 'Contacts', missions: 'Missions', tasks: 'Task history', alerts: 'Alerts',
    approvals: 'Approvals', camera: 'Camera', settings: 'HUD settings',
  };

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      {open && (
        <div className="hud-phone-in w-[280px] h-[min(540px,calc(100vh-150px))] rounded-[34px] p-2 bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,0.55)] border border-white/15">
          <div className="relative w-full h-full rounded-[27px] overflow-hidden bg-gradient-to-br from-slate-900 via-[#0B1328] to-[#120B26] flex flex-col">
            {/* status bar */}
            <div className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] font-semibold text-slate-200">
              <span>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="w-16 h-4 rounded-full bg-black/80" />
              <span className={`flex items-center gap-1 ${live.online ? 'text-emerald-300' : 'text-red-300'}`}>
                {live.online ? <Wifi size={11} /> : <WifiOff size={11} />}{live.online ? 'Live' : 'Offline'}
              </span>
            </div>

            {app === 'home' ? (
              <div className="flex-1 px-4 pt-3 overflow-y-auto">
                <div className="text-center mb-4">
                  <div className="text-[22px] font-black italic tracking-tight bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300 bg-clip-text text-transparent">CITY AI</div>
                  <div className="text-[10px] text-slate-400">{clock.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                  {apps.map(a => (
                    <button key={a.id} type="button" className="flex flex-col items-center gap-1 group"
                      onClick={() => a.id === 'map' ? (onOpenChange(false), props.onOpenMap()) : setApp(a.id)}>
                      <span className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${a.tint} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                        <a.Icon size={21} className="text-white" />
                        {a.badge ? <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{a.badge}</span> : null}
                      </span>
                      <span className="text-[10px] text-slate-200">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/10">
                  <button type="button" onClick={() => setApp('home')} className="text-cyan-300 hover:text-cyan-200 flex items-center text-[11px] font-semibold">
                    <ChevronLeft size={16} /> Home
                  </button>
                  <span className="ml-auto mr-2 text-[12px] font-bold text-slate-100">{title[app]}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 text-slate-200">
                  {app === 'contacts' && <ContactsApp onSelect={(id) => { onOpenChange(false); props.onSelectCitizen(id); }} />}
                  {app === 'missions' && <MissionsApp onOpenBoard={() => { onOpenChange(false); props.onOpenMissions(); }} />}
                  {app === 'tasks' && (live.online ? <TaskHistoryList tasks={live.tasks} /> : <Offline />)}
                  {app === 'alerts' && (
                    <div className="space-y-1.5">
                      {props.notices.length === 0 && <div className="text-[11px] text-slate-400 text-center p-4">No alerts this session.</div>}
                      {props.notices.map(n => <NoticeCard key={n.id} n={n} compact />)}
                    </div>
                  )}
                  {app === 'approvals' && <ApprovalsApp />}
                  {app === 'camera' && (
                    <CameraApp mode={props.cameraMode} onSelect={props.onSelectCameraMode} jet={props.isPilotingJet} onToggleJet={props.onToggleJet} />
                  )}
                  {app === 'settings' && <SettingsApp settings={props.settings} onChange={props.onSettingsChange} />}
                </div>
              </div>
            )}
            <div className="flex justify-center pb-2 pt-1">
              <button type="button" onClick={() => (app === 'home' ? onOpenChange(false) : setApp('home'))} className="w-24 h-1.5 rounded-full bg-white/40 hover:bg-white/70" title={app === 'home' ? 'Close phone' : 'Home'} />
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); onOpenChange(!open); }}
        className="relative w-11 h-11 rounded-2xl bg-slate-950/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-slate-100 hover:border-amber-300/60 hover:text-amber-200 transition shadow-lg"
        title="Phone [P]"
      >
        <Smartphone size={19} />
        {live.approvals.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">{live.approvals.length}</span>}
      </button>
    </div>
  );
};

const Offline = () => <div className="text-[11px] text-red-300 text-center p-4">Backend offline.</div>;

const ContactsApp: React.FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const live = useLiveData();
  if (!live.online) return <Offline />;
  return (
    <div className="space-y-1">
      {live.citizens.map(c => {
        const st = statusStyle(c.status);
        return (
          <button key={c.id} type="button" onClick={() => onSelect(c.id)} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 text-left">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0" style={{ background: c.color }}>
              {c.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-bold text-slate-50 truncate">{c.name}</span>
              <span className="block text-[10px] text-slate-400 truncate">{c.current_task || c.profession}</span>
            </span>
            <span className={`flex items-center gap-1 text-[9px] font-bold uppercase ${st.text}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span>
            <MessageSquare size={14} className="text-emerald-300 shrink-0" />
          </button>
        );
      })}
    </div>
  );
};

const MissionsApp: React.FC<{ onOpenBoard: () => void }> = ({ onOpenBoard }) => {
  const live = useLiveData();
  return (
    <div className="space-y-2">
      <button type="button" onClick={onOpenBoard} className="w-full py-2 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-black text-[11px] font-bold">Open mission board / publish</button>
      {!live.online ? <Offline /> : live.missions.length === 0 ? (
        <div className="text-[11px] text-slate-400 text-center p-3">No missions yet.</div>
      ) : live.missions.map(m => {
        const st = statusStyle(m.status);
        return (
          <div key={m.id} className="p-2 rounded-xl bg-white/5">
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-bold text-slate-50 flex-1 leading-tight">{m.title}</span>
              <span className={`text-[9px] font-bold uppercase ${st.text}`}>{st.label}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${m.progress}%` }} /></div>
            <div className="mt-1 space-y-0.5">
              {m.subtasks.map(s => (
                <div key={s.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle(s.status).dot}`} />
                  <span className="truncate flex-1 text-slate-300">{s.title}</span>
                  <span className={`${statusStyle(s.status).text} text-[9px]`}>{statusStyle(s.status).label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ApprovalsApp: React.FC = () => {
  const live = useLiveData();
  if (!live.online) return <Offline />;
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-slate-400 leading-snug">
        Host actions outside a citizen's own workspace wait here. Approve or deny each one in the approval card at the top of the screen.
      </div>
      {live.approvals.length === 0 && <div className="text-[11px] text-slate-400 text-center p-3">Nothing waiting for approval.</div>}
      {live.approvals.map(a => (
        <div key={a.id} className="p-2 rounded-xl bg-amber-500/10 border border-amber-400/30">
          <div className="text-[11px] font-bold text-amber-200">{a.agent_name}</div>
          <div className="text-[10px] text-slate-300">{a.summary}</div>
          <pre className="mt-1 text-[10px] font-mono text-cyan-200 whitespace-pre-wrap break-all">{a.detail.command || a.detail.target || a.detail.path}</pre>
        </div>
      ))}
    </div>
  );
};

const CameraApp: React.FC<{ mode: CameraMode; onSelect: (m: CameraMode) => void; jet: boolean; onToggleJet: (p: boolean) => void }> = ({ mode, onSelect, jet, onToggleJet }) => {
  const opts: [CameraMode, string, string][] = [['TPV', 'Third person', 'Camera behind your Governor'], ['FPV', 'First person', 'See through your own eyes'], ['ORBIT', 'Orbit', 'Overview of the city']];
  return (
    <div className="space-y-1.5">
      {opts.map(([m, label, hint]) => (
        <button key={m} type="button" onClick={() => onSelect(m)}
          className={`w-full text-left p-2.5 rounded-xl border ${mode === m ? 'border-cyan-400/60 bg-cyan-500/15' : 'border-white/10 hover:bg-white/5'}`}>
          <div className="text-[11.5px] font-bold text-slate-50">{label}</div>
          <div className="text-[10px] text-slate-400">{hint}</div>
        </button>
      ))}
      <button type="button" onClick={() => onToggleJet(!jet)} className="w-full mt-2 p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white text-[11px] font-bold flex items-center justify-center gap-2">
        <Plane size={14} /> {jet ? 'Land the jet [G]' : 'Board the jet [G]'}
      </button>
    </div>
  );
};

const SettingsApp: React.FC<{ settings: HudSettings; onChange: (s: HudSettings) => void }> = ({ settings, onChange }) => {
  const rows: [keyof HudSettings, string][] = [['minimap', 'Mini-map'], ['missions', 'Mission tracker'], ['citizens', 'Citizen activity'], ['notifications', 'Notifications']];
  return (
    <div className="space-y-1">
      {rows.map(([k, label]) => (
        <label key={k} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 cursor-pointer">
          <span className="text-[11.5px] text-slate-100">{label}</span>
          <input type="checkbox" checked={settings[k]} onChange={e => onChange({ ...settings, [k]: e.target.checked })} className="w-4 h-4 accent-amber-400" />
        </label>
      ))}
      <div className="text-[10px] text-slate-500 px-2 pt-2">Keys: [P] phone · [N] map · [M] missions · [E] talk · [V] camera · [H] hide HUD panels</div>
    </div>
  );
};
