import React, { useState } from 'react';
import { 
  Eye, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Users, 
  Layers, 
  X, 
  Compass, 
  ShieldCheck, 
  Hammer, 
  FileCode2, 
  HelpCircle,
  Play,
  Pause,
  Sun,
  Moon,
  MessageSquare,
  History,
  Briefcase,
  Zap,
  Sparkle,
  ExternalLink,
  Globe,
  Monitor,
  Plane,
  Crown,
  Terminal,
  Activity
} from 'lucide-react';
import { 
  CityMetrics, 
  SimulationEvent, 
  CameraMode, 
  AgentCharacter,
  AgentTask,
  PublicMission,
  PlayerState,
  AgentChatMessage,
  Building,
  RoadSegment
} from '../../simulation/types';
import { DeliverableArtifact } from '../../types';
import { absoluteLink } from '../../api/client';
import { AgentReasoningFeed } from './hud/AgentReasoningFeed';
import { HostApprovalPanel } from './HostApprovalPanel';
import { ModelPicker } from './ModelPicker';
import { TaskHistoryPanel } from './TaskHistoryPanel';
import { CityLiveDataContext, PANEL, useCityLiveDataPoller } from './hud/useCityLiveData';
import { MiniMap, isLandmark, shortName } from './hud/MiniMap';
import { MissionTracker } from './hud/MissionTracker';
import { CitizenActivityPanel } from './hud/CitizenActivityPanel';
import { StatusCluster } from './hud/StatusCluster';
import { NotificationFeed, useHudNotifications } from './hud/Notifications';
import { RevisionDialog } from './hud/RevisionBox';
import { MissionChannelPanel, openMissionChannel } from './hud/MissionChannel';
import { DEFAULT_HUD_SETTINGS, HudSettings, PhoneMenu } from './hud/PhoneMenu';
import { CitizenInspectCard, InteractionPrompt } from './hud/CitizenInteraction';
import { ApprovalStars, COND, FeedPanel, HudBadge, IncomingCall, KeyHints, ObjectiveCard, Speedometer, StatusBars, TopCounters } from './hud/RpHud';
import type { HudNotice } from './hud/Notifications';
import { districtAt, districtZones } from '../../simulation/districts';

interface CityHUDProps {
  metrics: CityMetrics;
  buildings: Building[];
  roads: RoadSegment[];
  agentCharacters: AgentCharacter[];
  publicMissions: PublicMission[];
  activeMissionId: string | null;
  events: SimulationEvent[];
  simulationTime: number;
  cameraMode: CameraMode;
  playerState: PlayerState;
  interactingAgent: AgentCharacter | null;
  showPublicMissionsModal: boolean;
  activeArtifact?: DeliverableArtifact | null;
  onSelectCameraMode: (mode: CameraMode) => void;
  onToggleJetFlight?: (piloting: boolean) => void;
  onInteractWithAgent?: (agentId: string) => void;
  onCloseAgentInteraction: () => void;
  onOpenPublicMissions: () => void;
  onClosePublicMissions: () => void;
  onAssignIndividualTask: (agentId: string, task: { title: string; description: string; expectedDeliverable: string; priority: AgentTask['priority'] }) => void;
  onDirectWorkCommand: (agentId: string) => void;
  onSendChatMessage: (agentId: string, message: string) => void;
  onPublishPublicMission: (mission: { title: string; description: string; category: PublicMission['category'] }) => void;
  onRequestAgentStatus: (agentId: string) => string;
  onViewArtifact?: (taskId: string) => void;
  onCloseArtifact?: () => void;
  onOpenDeliverableOnComputer?: (artifactId: string) => void;
  onPreviewDeliverable?: (url: string, title: string, type: string) => void;
}

export const CityHUD: React.FC<CityHUDProps> = ({
  metrics,
  buildings,
  roads,
  agentCharacters,
  publicMissions,
  activeMissionId,
  events,
  simulationTime,
  cameraMode,
  playerState,
  interactingAgent,
  showPublicMissionsModal,
  onSelectCameraMode,
  onToggleJetFlight,
  onInteractWithAgent,
  onCloseAgentInteraction,
  onOpenPublicMissions,
  onClosePublicMissions,
  onAssignIndividualTask,
  onDirectWorkCommand,
  onSendChatMessage,
  onPublishPublicMission,
  onRequestAgentStatus,
  activeArtifact,
  onViewArtifact,
  onCloseArtifact,
  onOpenDeliverableOnComputer,
  onPreviewDeliverable
}) => {
  // Individual task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDeliverable, setTaskDeliverable] = useState('');
  const [taskPriority, setTaskPriority] = useState<AgentTask['priority']>('HIGH');
  const [, forceRender] = useState(0);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState<'PROFILE' | 'ASSIGN' | 'HISTORY'>('PROFILE');

  // 2-Way chat input state
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Public mission form state
  const [missionTitle, setMissionTitle] = useState('');
  const [missionDesc, setMissionDesc] = useState('');
  const [missionCategory, setMissionCategory] = useState<PublicMission['category']>('SOFTWARE');

  const nearbyAgent = agentCharacters.find(a => a.id === playerState.nearbyAgentId);

  // --- GTA-style HUD: live backend data, notifications, phone, panel visibility ---
  const live = useCityLiveDataPoller();
  const notifications = useHudNotifications(live);
  const [call, setCall] = useState<HudNotice | null>(null);
  const [revisionTaskId, setRevisionTaskId] = useState<string | null>(null);
  const [channelMissionId, setChannelMissionId] = useState<string | null>(null);
  React.useEffect(() => {
    const open = (e: Event) => setChannelMissionId((e as CustomEvent<string>).detail);
    window.addEventListener('cityai:channel', open);
    return () => window.removeEventListener('cityai:channel', open);
  }, []);
  const revisionTask = revisionTaskId ? live.tasks.find(t => t.task_id === revisionTaskId) || null : null;
  const lastCallId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const n = notifications.history[0];
    if (!n || n.id === lastCallId.current || (n.kind !== 'verified' && n.kind !== 'failed')) return;
    lastCallId.current = n.id;
    setCall(n);
    const t = window.setTimeout(() => setCall(c => (c && c.id === n.id ? null : c)), 15000);
    return () => window.clearTimeout(t);
  }, [notifications.history]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [mapSignal, setMapSignal] = useState(0);
  const [panelsHidden, setPanelsHidden] = useState(false);
  // Your computer's clock (the 3D sky keeps its own daylight cycle)
  const [realNow, setRealNow] = useState(() => new Date());
  React.useEffect(() => {
    const t = window.setInterval(() => setRealNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  const [hudSettings, setHudSettings] = useState<HudSettings>(() => {
    try {
      const saved = window.localStorage.getItem('cityai.hudSettings');
      return saved ? { ...DEFAULT_HUD_SETTINGS, ...JSON.parse(saved) } : DEFAULT_HUD_SETTINGS;
    } catch {
      return DEFAULT_HUD_SETTINGS;
    }
  });
  const updateHudSettings = (next: HudSettings) => {
    setHudSettings(next);
    try { window.localStorage.setItem('cityai.hudSettings', JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  // [P] phone, [H] hide/show HUD panels, Esc closes the phone (never while typing)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'p' && !e.repeat) {
        if (document.pointerLockElement) document.exitPointerLock();
        setPhoneOpen(o => !o);
      } else if (k === 'h' && !e.repeat) {
        setPanelsHidden(h => !h);
      } else if (k === 'q' && !e.repeat && !modalOpenRef.current) {
        const ag = nearbyRef.current;
        setInspectId(cur => (cur ? null : ag ? ag.id : null));
      } else if (k === 't' && !e.repeat && !modalOpenRef.current && nearbyRef.current) {
        if (document.pointerLockElement) document.exitPointerLock();
        setActiveAgentTab('ASSIGN');
        if (onInteractWithAgent) onInteractWithAgent(nearbyRef.current.id);
      } else if (e.key === 'Escape') {
        setPhoneOpen(false);
        setInspectId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The five work districts (same blocks the 3D scene tints and signs)
  const zones = React.useMemo(
    () => districtZones(buildings, roads.flatMap(r => [{ x: r.start[0], z: r.start[1] }, { x: r.end[0], z: r.end[1] }])),
    [buildings, roads],
  );

  // Where you are: district + nearest named workplace (from the same layout the 3D scene is built from)
  const px = Math.round(playerState.x / 2), pz = Math.round(playerState.z / 2);
  const locationName = React.useMemo(() => {
    const zone = districtAt(px * 2, pz * 2, zones);
    if (zone) return zone.name;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of buildings) {
      if (!isLandmark(b)) continue;
      const d = Math.hypot(b.x - px * 2, b.z - pz * 2);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) return 'City streets';
    return bestD < 22 ? shortName(best.name) : `Near ${shortName(best.name)}`;
  }, [buildings, px, pz, zones]);

  const openCitizen = (id: string) => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (onInteractWithAgent) onInteractWithAgent(id);
  };
  // Citizen interactions: talk (E), assign a task (T), work order (F), inspect (Q)
  const [inspectId, setInspectId] = useState<string | null>(null);
  const inspectAgent = agentCharacters.find(a => a.id === inspectId) || null;
  const talkTo = (id: string) => { setActiveAgentTab('PROFILE'); openCitizen(id); };
  const assignTo = (id: string) => { setActiveAgentTab('ASSIGN'); openCitizen(id); };
  const nearbyRef = React.useRef<typeof nearbyAgent>(undefined);
  nearbyRef.current = nearbyAgent;
  const modalOpen = !!interactingAgent || showPublicMissionsModal || !!activeArtifact;
  const modalOpenRef = React.useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const showPanels = !panelsHidden && !modalOpen;

  // Auto-scroll chat to bottom
  React.useEffect(() => {
    if (activeAgentTab === 'PROFILE') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [interactingAgent?.chatHistory, activeAgentTab]);

  // Global Exploration Keyboard Listeners: [E] 2-Way Comms, [F] Work Order
  React.useEffect(() => {
    const onKeyShortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const k = e.key.toLowerCase();

      // [E] Key: Open 2-Way Live Comms with nearest citizen
      if (k === 'e' && !interactingAgent && !showPublicMissionsModal) {
        e.preventDefault();
        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch (_) {}
        }

        let targetId = nearbyAgent?.id;
        if (!targetId && agentCharacters.length > 0) {
          let minD = 9999;
          agentCharacters.forEach(ag => {
            const d = Math.hypot(playerState.x - ag.x, playerState.z - ag.z);
            if (d < minD) {
              minD = d;
              targetId = ag.id;
            }
          });
        }
        if (!targetId && agentCharacters.length > 0) {
          targetId = agentCharacters[0].id;
        }
        if (targetId && onInteractWithAgent) {
          onInteractWithAgent(targetId);
        }
      }

      // [F] Key: Work Command (ignore auto-repeat so holding F sends one order)
      if (k === 'f' && !e.repeat) {
        const ag = interactingAgent || nearbyAgent || (agentCharacters.length > 0 ? agentCharacters[0] : null);
        if (ag) {
          e.preventDefault();
          onDirectWorkCommand(ag.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyShortcut);
    return () => window.removeEventListener('keydown', onKeyShortcut);
  }, [interactingAgent, showPublicMissionsModal, nearbyAgent, agentCharacters, playerState, onInteractWithAgent, onDirectWorkCommand]);

  // Time format
  const hours = Math.floor(simulationTime);
  const minutes = Math.floor((simulationTime - hours) * 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeString = `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  // Handle direct task submit
  const handleAssignTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactingAgent || !taskTitle.trim()) return;

    onAssignIndividualTask(interactingAgent.id, {
      title: taskTitle.trim(),
      description: taskDesc.trim() || `Priority directive assigned by player to ${interactingAgent.name}`,
      expectedDeliverable: taskDeliverable.trim() || 'Verified deliverable artifact',
      priority: taskPriority
    });

    setTaskTitle('');
    setTaskDesc('');
    setTaskDeliverable('');
    onCloseAgentInteraction();
  };

  // Handle 2-Way chat submit
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactingAgent || !chatInput.trim()) return;
    onSendChatMessage(interactingAgent.id, chatInput.trim());
    setChatInput('');
  };

  // Handle quick prompt send
  const handleSendQuickPrompt = (promptText: string) => {
    if (!interactingAgent) return;
    onSendChatMessage(interactingAgent.id, promptText);
  };

  // Handle publish public mission
  const handlePublishMission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!missionTitle.trim()) return;

    onPublishPublicMission({
      title: missionTitle.trim(),
      description: missionDesc.trim() || 'City-wide collective autonomous mission.',
      category: missionCategory
    });

    setMissionTitle('');
    setMissionDesc('');
  };

  return (
    <CityLiveDataContext.Provider value={live}>
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden font-mono">
      <HostApprovalPanel />
      {revisionTask && <RevisionDialog task={revisionTask} onClose={() => setRevisionTaskId(null)} />}
      {channelMissionId && <MissionChannelPanel missionId={channelMissionId} onClose={() => setChannelMissionId(null)} />}
      {/* 1. TOP LEFT: badge, clickable key hints, current objective. TOP RIGHT: live counters + feed panel */}
      {!panelsHidden && (
        <div className="absolute left-4 top-3 z-20 flex flex-col gap-4 font-sans">
          <HudBadge location={locationName} showFps={hudSettings.fps} />
          {!modalOpen && (
            <div className="hidden md:block">
              <KeyHints hints={[
                { k: 'E', label: 'Talk', onClick: () => { const id = nearbyAgent?.id || agentCharacters[0]?.id; if (id) talkTo(id); } },
                { k: 'T', label: 'Assign task', onClick: () => { const id = nearbyAgent?.id || agentCharacters[0]?.id; if (id) assignTo(id); } },
                { k: 'Q', label: 'Inspect', onClick: () => setInspectId(id => (id ? null : nearbyAgent?.id || null)), active: !!inspectId },
                { k: 'P', label: 'Phone', onClick: () => setPhoneOpen(o => !o), active: phoneOpen },
                { k: 'M', label: 'Missions', onClick: onOpenPublicMissions },
                { k: 'N', label: 'City map', onClick: () => setMapSignal(n => n + 1) },
                { k: 'G', label: playerState.isPilotingJet ? 'Land jet' : 'Jet', onClick: () => { if (onToggleJetFlight) onToggleJetFlight(!playerState.isPilotingJet); }, active: !!playerState.isPilotingJet },
                { k: 'V', label: cameraMode === 'FPV' ? 'Third person' : 'First person', onClick: () => onSelectCameraMode(cameraMode === 'FPV' ? 'TPV' : 'FPV') },
                { k: 'H', label: 'Hide HUD', onClick: () => setPanelsHidden(true) },
              ]} />
            </div>
          )}
          {!modalOpen && hudSettings.missions && (
            <ObjectiveCard agents={agentCharacters} player={playerState} onOpenMissions={onOpenPublicMissions} onTalk={talkTo} />
          )}
        </div>
      )}
      {panelsHidden && (
        <button type="button" onClick={() => setPanelsHidden(false)}
          className={`${COND} absolute left-4 top-3 z-20 pointer-events-auto px-2.5 py-1 rounded bg-black/70 text-white text-[13px] font-bold border border-white/15`}>
          H · show HUD
        </button>
      )}
      {!panelsHidden && (
        <div className="absolute right-4 top-3 z-20 flex flex-col items-end gap-3">
          <TopCounters />
          {!modalOpen && !inspectAgent && hudSettings.citizens && !playerState.isPilotingJet && (
            <div className="hidden md:block">
              <FeedPanel agents={agentCharacters} notices={notifications.history} onSelectCitizen={talkTo}
                onOpenMissions={onOpenPublicMissions} onSendMessage={onSendChatMessage} />
            </div>
          )}
        </div>
      )}

      {inspectAgent && !modalOpen && (
        <div className="absolute right-4 top-[64px] z-30">
          <CitizenInspectCard
            agent={inspectAgent}
            onClose={() => setInspectId(null)}
            onTalk={() => { setInspectId(null); talkTo(inspectAgent.id); }}
            onAssign={() => { setInspectId(null); assignTo(inspectAgent.id); }}
            onWork={() => onDirectWorkCommand(inspectAgent.id)}
          />
        </div>
      )}
      {/* 1.5. SOVEREIGN-X1 PRIVATE JET AVIONICS FLIGHT HUD */}
      {playerState.isPilotingJet && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-2 z-30 animate-in fade-in zoom-in-95 duration-200">
          {/* Main Flight Avionics Bar */}
          <div className="bg-[#050D1A]/95 backdrop-blur-md border-2 border-cyan-400/90 rounded-2xl px-6 py-3 shadow-[0_0_40px_rgba(6,182,212,0.45)] flex items-center gap-6 text-xs text-cyan-300">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 shadow-inner">
                <Plane size={18} className="animate-pulse" />
              </div>
              <div>
                <div className="text-[9px] font-mono tracking-widest text-cyan-400 font-bold uppercase">SUPERSONIC STEALTH JET</div>
                <div className="text-sm font-black text-white tracking-wide">SOVEREIGN-X1</div>
              </div>
            </div>

            <div className="h-8 w-px bg-cyan-800/80" />

            <div className="flex flex-col items-center min-w-[70px]">
              <span className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold">AIRSPEED</span>
              <span className="text-base font-black text-white">
                {playerState.jetSpeed ?? 0} <span className="text-[10px] text-cyan-400 font-bold">KM/H</span>
              </span>
            </div>

            <div className="h-8 w-px bg-cyan-800/80" />

            <div className="flex flex-col items-center min-w-[65px]">
              <span className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold">ALTITUDE</span>
              <span className="text-base font-black text-white">
                {playerState.jetAltitude ?? 0} <span className="text-[10px] text-cyan-400 font-bold">M</span>
              </span>
            </div>

            <div className="h-8 w-px bg-cyan-800/80" />

            <div className="flex flex-col items-center min-w-[65px]">
              <span className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold">HEADING</span>
              <span className="text-base font-black text-white">
                {(playerState.jetHeading ?? 0).toString().padStart(3, '0')}°
              </span>
            </div>

            <div className="h-8 w-px bg-cyan-800/80" />

            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold">THRUST DRIVE</span>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded border ${
                (playerState.jetSpeed ?? 0) > 85 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400 animate-pulse' 
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
              }`}>
                {(playerState.jetSpeed ?? 0) > 85 ? '🚀 AFTERBURNER MAX' : '⚡ CRUISE CRITICAL'}
              </span>
            </div>
          </div>

          {/* Flight Controls Legend Bar */}
          <div className="bg-slate-950/90 backdrop-blur border border-cyan-500/40 rounded-xl px-5 py-1.5 text-[11px] text-cyan-200/90 flex items-center gap-3 shadow-lg">
            <span><kbd className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 rounded font-bold text-cyan-300">W / S</kbd> Throttle / Airbrake</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 rounded font-bold text-cyan-300">A / D</kbd> Aerodynamic Roll & Bank</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 rounded font-bold text-cyan-300">SPACE</kbd> Pitch Climb</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 rounded font-bold text-cyan-300">SHIFT</kbd> Pitch Dive</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 bg-blue-950 border border-blue-600 rounded font-bold text-blue-300">V</kbd> Cockpit / Chase Cam</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 bg-rose-950 border border-rose-600 rounded font-bold text-rose-300">G</kbd> Disembark / Land Jet</span>
          </div>
        </div>
      )}

      {/* 2. CENTER RETICLE & PROXIMITY PROMPT */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Center Crosshair */}
        <div className="relative flex items-center justify-center">
          <div className={`w-2 h-2 rounded-full border transition-all duration-200 ${
            nearbyAgent 
              ? 'border-emerald-400 bg-emerald-400/40 scale-150 shadow-lg shadow-emerald-500/50' 
              : 'border-white/60 bg-white/20'
          }`} />
          <div className="absolute w-6 h-0.5 bg-white/30" />
          <div className="absolute h-6 w-0.5 bg-white/30" />
        </div>

        {/* Proximity prompt: what you can do with the citizen next to you (live status from the backend).
            Docked near the bottom so it never covers the citizen you are looking at. */}
        {nearbyAgent && !interactingAgent && !showPublicMissionsModal && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[252px] sm:bottom-24 z-30 pointer-events-auto">
            <InteractionPrompt
              agent={nearbyAgent}
              onTalk={() => talkTo(nearbyAgent.id)}
              onAssign={() => assignTo(nearbyAgent.id)}
              onWork={() => onDirectWorkCommand(nearbyAgent.id)}
              onInspect={() => setInspectId(id => (id === nearbyAgent.id ? null : nearbyAgent.id))}
            />
          </div>
        )}

        {/* Pointer Lock Help Banner when not locked */}
        {!playerState.isPointerLocked && !interactingAgent && !showPublicMissionsModal && (
          <div className={`${COND} mt-4 px-3 py-1 rounded bg-black/45 text-[13px] text-white/80 pointer-events-none`}>
            Click to look around · WASD move · Shift run · Esc frees the mouse
          </div>
        )}
      </div>

      {/* 3. PROXIMITY AGENT INTERACTION PANEL (When pressing E) */}
      {interactingAgent && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-[#090E1A] border border-blue-500/50 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-xs flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#060A13]">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-lg border border-white/20"
                  style={{ backgroundColor: interactingAgent.color }}
                >
                  {interactingAgent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                    <span>{interactingAgent.name}</span>
                    <span 
                      className="text-[10px] px-2 py-0.5 rounded font-black uppercase border shadow-sm"
                      style={{ 
                        backgroundColor: `${interactingAgent.aiModelBadgeColor}20`, 
                        borderColor: interactingAgent.aiModelBadgeColor,
                        color: interactingAgent.aiModelBadgeColor 
                      }}
                    >
                      {interactingAgent.aiProvider} • {interactingAgent.aiModel}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                      interactingAgent.status === 'WORKING' 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {interactingAgent.status} ({interactingAgent.workProgress.toFixed(0)}%)
                    </span>
                  </h2>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                    {interactingAgent.profession} • {interactingAgent.department}
                  </div>
                  <div className="mt-1.5 max-w-md">
                    <ModelPicker
                      key={interactingAgent.id}
                      agentId={interactingAgent.id}
                      currentModel={interactingAgent.aiModel}
                      onChanged={(model, providerLabel) => {
                        interactingAgent.aiModel = model;
                        interactingAgent.aiProvider = providerLabel;
                        forceRender(n => n + 1);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons: [F] Make Them Work & Close */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onDirectWorkCommand(interactingAgent.id)}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold rounded-xl shadow-lg flex items-center gap-1.5 transition text-xs active:scale-95 cursor-pointer"
                  title="Command this citizen to work immediately (Shortcut: F)"
                >
                  <Zap size={14} className="fill-current" />
                  <span>[F] MAKE THEM WORK</span>
                </button>

                <button 
                  onClick={onCloseAgentInteraction}
                  className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Interaction Tabs */}
            <div className="flex border-b border-slate-800 bg-[#070C16] text-[11px]">
              <button
                onClick={() => setActiveAgentTab('PROFILE')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'PROFILE' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <MessageSquare size={14} />
                <span>2-Way Live Comms</span>
              </button>
              <button
                onClick={() => setActiveAgentTab('ASSIGN')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'ASSIGN' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <Briefcase size={14} />
                <span>Custom Task Specification</span>
              </button>
              <button
                onClick={() => setActiveAgentTab('HISTORY')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'HISTORY' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <History size={14} />
                <span>Task History & Deliverables ({live.tasks.filter(t => t.agent_id === interactingAgent.id).length})</span>
              </button>
            </div>

            {/* Tab 1: 2-Way Live Comms & Dialogue */}
            {activeAgentTab === 'PROFILE' && (
              <div className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden">
                {/* Active Task Indicator */}
                {interactingAgent.activeTask ? (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <div>
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Active Task in Progress:</span>
                        <div className="text-slate-100 font-bold text-xs">{interactingAgent.activeTask.title}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-extrabold text-xs">{interactingAgent.workProgress.toFixed(0)}%</span>
                      <div className="text-[10px] text-slate-400">{interactingAgent.activeTask.expectedDeliverable}</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-2.5 flex items-center justify-between text-[11px] text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Citizen is available on standby. Press <strong>[F]</strong> to order them to work immediately!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDirectWorkCommand(interactingAgent.id)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-[10px] transition"
                    >
                      + Start Work Order
                    </button>
                  </div>
                )}

                {/* Live 2-Way Chat Message Stream */}
                <div className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto space-y-2.5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                  {(interactingAgent.chatHistory && interactingAgent.chatHistory.length > 0) ? (
                    interactingAgent.chatHistory.map(msg => (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col ${msg.sender === 'PLAYER' ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500">
                          <span className="font-bold text-slate-400">{msg.senderName}</span>
                          <span>•</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <div className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                          msg.sender === 'PLAYER' 
                            ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/20' 
                            : 'bg-slate-900 border border-slate-700/70 text-slate-200 rounded-tl-none shadow-md'
                        }`}>
                          <div className="whitespace-pre-wrap">{msg.text}</div>

                          {/* Computer Generated Deliverable Card (3D Presentation / Website / System Artifact) */}
                          {(msg.deliverableUrl || msg.deliverablePath) && (
                            <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-indigo-950/90 via-slate-900 to-blue-950/90 border border-cyan-500/50 shadow-xl shadow-cyan-950/40 text-left">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                  {msg.deliverableType === '3D_PRESENTATION' ? <Sparkles size={16} /> : <Globe size={16} />}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[9px] font-mono tracking-wider uppercase text-cyan-400 font-bold block">
                                    {msg.deliverableType === '3D_PRESENTATION' ? '🪐 Interactive 3D WebGL Presentation' : '🌐 Generated Web Experience'}
                                  </span>
                                  <div className="text-xs font-bold text-white truncate">
                                    {msg.deliverableTitle || 'Generated Deliverable'}
                                  </div>
                                </div>
                              </div>
                              {msg.deliverablePath && (
                                <div className="text-[10px] font-mono text-slate-300 bg-black/50 px-2.5 py-1.5 rounded border border-slate-700/60 truncate mb-2.5 select-all">
                                  📁 {msg.deliverablePath}
                                </div>
                              )}
                              {msg.deliverableUrl && (
                                <div className="flex items-center gap-1.5 mb-2.5">
                                  <a
                                    href={absoluteLink(msg.deliverableUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 min-w-0 text-[10px] font-mono text-cyan-300 hover:text-cyan-200 underline bg-black/50 px-2.5 py-1.5 rounded border border-cyan-700/50 truncate"
                                    title="Open in a new browser tab"
                                  >
                                    🔗 {absoluteLink(msg.deliverableUrl)}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(absoluteLink(msg.deliverableUrl!)).catch(() => {});
                                      setCopiedLink(msg.id);
                                      setTimeout(() => setCopiedLink(c => (c === msg.id ? null : c)), 1500);
                                    }}
                                    className="shrink-0 px-2 py-1.5 text-[10px] font-bold rounded border border-slate-600 text-slate-200 hover:bg-slate-700"
                                  >
                                    {copiedLink === msg.id ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                {msg.deliverableUrl && onPreviewDeliverable && (
                                  <button
                                    type="button"
                                    onClick={() => onPreviewDeliverable(msg.deliverableUrl!, msg.deliverableTitle || 'Deliverable', msg.deliverableType || 'HTML')}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg text-[11px] transition shadow-md shadow-cyan-600/30 active:scale-95"
                                  >
                                    <Eye size={13} />
                                    <span>Preview Here</span>
                                  </button>
                                )}
                                {msg.artifactId && onOpenDeliverableOnComputer && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenDeliverableOnComputer(msg.artifactId!)}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-lg text-[11px] transition shadow-md shadow-indigo-600/30 active:scale-95"
                                  >
                                    <ExternalLink size={13} />
                                    <span>Launch on Desktop</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      Channel open. Type any instruction or question to converse with {interactingAgent.name}.
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <AgentReasoningFeed agentId={interactingAgent.id} />

                {/* Quick Directive Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('What time is it right now on my computer?')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-lg text-[10px] text-cyan-300 transition flex items-center gap-1"
                  >
                    🕒 "What time is it?"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Is the city functioning well right now?')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 rounded-lg text-[10px] text-emerald-300 transition flex items-center gap-1"
                  >
                    🏙️ "City functioning well?"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Make an interactive 3D presentation on Autonomous AI Operating Systems')}
                    className="px-2.5 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-700/50 hover:border-indigo-400 rounded-lg text-[10px] text-indigo-200 transition flex items-center gap-1 font-medium"
                  >
                    🪐 "Make 3D presentation"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Make a modern responsive website for Cybernetic City Systems')}
                    className="px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700/50 hover:border-cyan-400 rounded-lg text-[10px] text-cyan-200 transition flex items-center gap-1 font-medium"
                  >
                    🌐 "Make website"
                  </button>
                  {/* Jarvis Computer Access Quick Prompts */}
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Run full Jarvis computer system diagnostics')}
                    className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-600/50 hover:border-emerald-400 rounded-lg text-[10px] text-emerald-200 transition flex items-center gap-1 font-medium"
                  >
                    <Activity size={11} className="text-emerald-400" />
                    <span>🖥️ "Jarvis Diagnostics"</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Execute powershell command: Get-Process | Select-Object -First 5 Id, ProcessName, CPU')}
                    className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-600/50 hover:border-purple-400 rounded-lg text-[10px] text-purple-200 transition flex items-center gap-1 font-medium"
                  >
                    <Terminal size={11} className="text-purple-400" />
                    <span>⚡ "Run: Get-Process"</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('Launch application: calc')}
                    className="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/50 hover:border-amber-400 rounded-lg text-[10px] text-amber-200 transition flex items-center gap-1 font-medium"
                  >
                    🚀 "Launch Calc"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('List files in current working directory')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-[10px] text-slate-300 transition flex items-center gap-1"
                  >
                    📂 "List Directory"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendQuickPrompt('What are your core technical skills and toolchain?')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] text-slate-300 transition"
                  >
                    🛠️ "Skills & tools?"
                  </button>
                  <button
                    type="button"
                    onClick={() => onDirectWorkCommand(interactingAgent.id)}
                    className="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/50 rounded-lg text-[10px] text-amber-300 font-bold flex items-center gap-1 transition"
                  >
                    <Zap size={11} className="fill-current" />
                    ⚡ "Work now [F]"
                  </button>
                </div>

                {/* 2-Way Text Input Bar */}
                <form onSubmit={handleSendChat} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Speak to ${interactingAgent.name} (Press Enter)...`}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
                  >
                    <Send size={13} />
                    <span>Send</span>
                  </button>
                </form>
                <div className="text-[10px] text-slate-500 px-1">
                  To change finished work, say <span className="text-amber-300">"revise that: …"</span> (or use Request changes in the phone's Tasks app).
                </div>
              </div>
            )}

            {/* Tab 2: Custom Task Specification */}
            {activeAgentTab === 'ASSIGN' && (
              <form onSubmit={handleAssignTask} className="p-5 space-y-4 overflow-y-auto">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Task Title:</label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Design Hospital Structural Blueprint..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Expected Deliverable:</label>
                  <input
                    type="text"
                    value={taskDeliverable}
                    onChange={(e) => setTaskDeliverable(e.target.value)}
                    placeholder="e.g. Verified CAD blueprint & structural calculations"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Suggested Templates */}
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase">Suggested Task Templates:</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTaskTitle('Create Interactive 3D WebGL Presentation');
                        setTaskDeliverable('presentation_3d.html');
                      }}
                      className="px-2 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 rounded border border-indigo-700/50 text-[10px] text-indigo-300 font-medium"
                    >
                      🪐 + 3D Presentation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskTitle('Build Responsive Enterprise Website');
                        setTaskDeliverable('index.html');
                      }}
                      className="px-2 py-1 bg-cyan-950/40 hover:bg-cyan-900/60 rounded border border-cyan-700/50 text-[10px] text-cyan-300 font-medium"
                    >
                      🌐 + Website
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskTitle('Design Hospital Structural Blueprint');
                        setTaskDeliverable('hospital_structural_blueprint.cad');
                      }}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-[10px] text-slate-300"
                    >
                      + Hospital Blueprint
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskTitle('Synthesize REST API Controllers with SQLite');
                        setTaskDeliverable('backend/app/controllers/api.py');
                      }}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-[10px] text-slate-300"
                    >
                      + REST API Controller
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskTitle('Run 20/20 Pytest Automated Verification Suite');
                        setTaskDeliverable('pytest_run_logs_20_passed.txt');
                      }}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-[10px] text-slate-300"
                    >
                      + Pytest Suite
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCloseAgentInteraction}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-blue-500/20"
                  >
                    <Send size={13} />
                    <span>Confirm & Dispatch Task</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: Task History */}
            {activeAgentTab === 'HISTORY' && (
              <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
                {!live.online ? (
                  <div className="text-center py-8 text-red-300 text-xs">Backend offline: task history unavailable.</div>
                ) : live.tasks.filter(t => t.agent_id === interactingAgent.id).length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">No tasks recorded for {interactingAgent.name} yet.</div>
                ) : (
                  live.tasks.filter(t => t.agent_id === interactingAgent.id).map(t => (
                    <div key={t.task_id} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-slate-200">{t.title}</span>
                        <span className={`font-bold ${t.status === 'VERIFIED' ? 'text-emerald-400' : t.status === 'FAILED' ? 'text-red-400' : 'text-slate-400'}`}>{t.status}</span>
                      </div>
                      {t.verification && (
                        <div className="text-[10px] text-slate-400">
                          {t.verification.passed} passed · {t.verification.failed} failed ({t.verification.suite}){t.verification.repair_attempts > 0 ? ` · ${t.verification.repair_attempts} repairs` : ''}
                        </div>
                      )}
                      {t.deliverables.map(d => (
                        <div key={d.path} className="text-[10px] font-mono text-cyan-300 break-all">
                          {d.url ? <a href={absoluteLink(d.url)} target="_blank" rel="noreferrer" className="hover:underline">{absoluteLink(d.url)}</a> : d.path}
                        </div>
                      ))}
                      {onViewArtifact && t.deliverables.length > 0 && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => onViewArtifact(t.task_id)}
                            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-[10px] font-semibold flex items-center gap-1.5 border border-emerald-500/40 transition"
                          >
                            <FileCode2 size={12} />
                            <span>Inspect Deliverable</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. PUBLIC MISSIONS MODAL (When pressing M or clicking Public Missions) */}
      {showPublicMissionsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-[#090E1A] border border-blue-500/50 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-xs max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#060A13]">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-100">City-Wide Public Missions Board</h2>
                  <div className="text-[10px] text-slate-400">All citizens independently evaluate and execute published missions</div>
                </div>
              </div>
              <button onClick={onClosePublicMissions} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-6">
              {/* Publish New Public Mission Form */}
              <form onSubmit={handlePublishMission} className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-xs text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Send size={13} />
                  <span>Publish New City Mission</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={missionTitle}
                      onChange={(e) => setMissionTitle(e.target.value)}
                      placeholder="e.g. Build modern trauma center in Civic District..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <select
                      aria-label="Mission Category"
                      value={missionCategory}
                      onChange={(e) => setMissionCategory(e.target.value as PublicMission['category'])}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                    >
                      <option value="CONSTRUCTION">Category: Construction</option>
                      <option value="SOFTWARE">Category: Software</option>
                      <option value="INFRASTRUCTURE">Category: Infrastructure</option>
                      <option value="RESEARCH">Category: Research</option>
                    </select>
                  </div>
                </div>

                {/* Pre-made Mission Presets */}
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                  <span>Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMissionTitle('Construct Modern Medical Trauma Center in Civic District');
                      setMissionCategory('CONSTRUCTION');
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  >
                    + Build Hospital
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMissionTitle('Synthesize Authenticated REST API with SQLite & Docker');
                      setMissionCategory('SOFTWARE');
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  >
                    + REST API & Docker
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20"
                  >
                    Publish to Entire City
                  </button>
                </div>
              </form>

              {/* Active Missions List */}
              <div className="space-y-4">
                <div className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                  Active City Missions ({publicMissions.length})
                </div>

                {publicMissions.map(m => (
                  <div key={m.id} className="bg-[#0B101E] border border-blue-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-slate-100">{m.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Category: <span className="text-blue-400">{m.category}</span> • Published: {m.publishedAt}
                        </div>
                        <button type="button" onClick={() => { onClosePublicMissions(); openMissionChannel(m.id); }}
                          className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/90 hover:bg-amber-400 text-black text-[10.5px] font-bold">
                          Open mission channel
                        </button>
                      </div>
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                        m.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        m.status === 'FAILED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        m.status === 'PARTIAL' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {m.status} ({m.progress}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full transition-all duration-300" style={{ width: `${m.progress}%` }} />
                    </div>

                    {/* Dependency Subtasks Graph */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Subtasks & Dependency Graph:</div>
                      <div className="space-y-1">
                        {m.subtasks.map((st, idx) => (
                          <div key={st.id} className="bg-slate-950/80 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                {idx + 1}
                              </span>
                              <span className="text-slate-200 font-semibold">{st.title}</span>
                              <span className="text-slate-500 text-[10px]">({st.assignedAgentName})</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              st.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                              st.status === 'WORKING' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                              st.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                              st.status === 'BLOCKED' ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {st.status} ({st.progress}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Deliverables */}
                    {m.deliverables.length > 0 && (
                      <div className="pt-1 text-[11px] text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={13} />
                        <span>Deliverables: {m.deliverables.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4.5 DELIVERABLE ARTIFACT INSPECTOR MODAL */}
      {activeArtifact && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-[#090E1A] border border-emerald-500/40 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-xs max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#060A13]">
              <div className="flex items-center gap-2.5">
                <FileCode2 size={20} className="text-emerald-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>{activeArtifact.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      VERIFIED DELIVERABLE
                    </span>
                  </h2>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    File: <span className="text-blue-300">{activeArtifact.relative_path || activeArtifact.file_path}</span> ({activeArtifact.file_size_bytes} bytes) • Agent: <span className="text-amber-300">{activeArtifact.agent_name}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onCloseArtifact} 
                className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                aria-label="Close Artifact Inspector"
              >
                <X size={18} />
              </button>
            </div>

            {/* Verification Status Banner & Content */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-400" />
                  <span>Execution & Verification Evidence:</span>
                </div>
                <div className="text-xs text-emerald-400 font-mono">
                  ✓ Exit Code: {activeArtifact.verification_exit_code} — {activeArtifact.verification_summary}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Full Sandboxed Path: {activeArtifact.file_path}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Artifact Content / Code Preview:</span>
                  <span className="text-slate-500 font-mono">{activeArtifact.relative_path.split('.').pop()?.toUpperCase() || 'SOURCE'}</span>
                </div>
                <pre className="bg-[#040711] p-4 rounded-xl border border-slate-800 text-slate-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 selection:bg-blue-600/40">
                  {activeArtifact.content}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#060A13] flex items-center justify-between">
              <div className="text-[10px] text-slate-500">
                Created At: {activeArtifact.created_at} • Task ID: {activeArtifact.task_id}
              </div>
              <button
                type="button"
                onClick={onCloseArtifact}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BOTTOM LEFT: notifications, approval stars, mini-map with status bars */}
      <div className="absolute left-4 bottom-4 z-30 flex flex-col gap-2 items-start">
        {hudSettings.notifications && !modalOpen && (
          <NotificationFeed toasts={notifications.toasts} onDismiss={notifications.dismiss} onRevise={setRevisionTaskId} />
        )}
        {hudSettings.minimap && !panelsHidden && (
          <div className="flex flex-col items-start">
            <ApprovalStars />
            <div className="mt-1">
              <MiniMap
                buildings={buildings}
                roads={roads}
                agents={agentCharacters}
                player={playerState}
                onSelectCitizen={openCitizen}
                locationName={locationName}
                openSignal={mapSignal}
                zones={zones}
              />
            </div>
            <div className="w-[196px]"><StatusBars /></div>
          </div>
        )}
      </div>

      {/* BOTTOM RIGHT: incoming call, jet speedometer, phone */}
      <div className="absolute right-4 bottom-[76px] z-40 flex flex-col items-end gap-3">
        <IncomingCall notice={call} agents={agentCharacters} onAccept={(id) => { setCall(null); talkTo(id); }} onDecline={() => setCall(null)}
          onRevise={(id) => { setCall(null); setRevisionTaskId(id); }} />
        {playerState.isPilotingJet && <Speedometer speed={playerState.jetSpeed ?? 0} altitude={playerState.jetAltitude ?? 0} />}
      </div>

      <div className="absolute right-3 sm:right-4 bottom-3 sm:bottom-4 z-40 font-sans">
        <PhoneMenu
          open={phoneOpen}
          onOpenChange={setPhoneOpen}
          onSelectCitizen={openCitizen}
          onOpenMissions={onOpenPublicMissions}
          onOpenMap={() => setMapSignal(n => n + 1)}
          cameraMode={cameraMode}
          onSelectCameraMode={onSelectCameraMode}
          isPilotingJet={!!playerState.isPilotingJet}
          onToggleJet={(p) => { if (onToggleJetFlight) onToggleJetFlight(p); }}
          notices={notifications.history}
          settings={hudSettings}
          onSettingsChange={updateHudSettings}
        />
      </div>
    </div>
    </CityLiveDataContext.Provider>
  );
};
