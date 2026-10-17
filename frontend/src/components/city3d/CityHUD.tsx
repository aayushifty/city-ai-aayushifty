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
  AgentChatMessage
} from '../../simulation/types';
import { DeliverableArtifact } from '../../types';
import { absoluteLink } from '../../api/client';
import { HostApprovalPanel } from './HostApprovalPanel';
import { ModelPicker } from './ModelPicker';
import { TaskHistoryPanel } from './TaskHistoryPanel';

interface CityHUDProps {
  metrics: CityMetrics;
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
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden font-mono">
      <HostApprovalPanel />
      {/* 1. TOP MINIMAL EXPLORATION BAR */}
      <div className="p-4 flex items-center justify-between">
        {/* Compass & Location Tag */}
        <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl px-4 py-2 pointer-events-auto flex items-center gap-4 text-xs shadow-2xl">
          <div className="flex items-center gap-2 text-slate-100">
            <Compass size={15} className="text-blue-400 animate-spin-slow" />
            <span className="font-bold tracking-wider text-emerald-400">CITY_AI_AAYUSHIFTY METROPOLIS</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="text-[11px] text-slate-400">
            POS: <span className="text-slate-200">X: {playerState.x.toFixed(1)}, Z: {playerState.z.toFixed(1)}</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
            {simulationTime >= 6 && simulationTime <= 18 ? (
              <Sun size={13} className="text-amber-400" />
            ) : (
              <Moon size={13} className="text-blue-400" />
            )}
            <span>{timeString}</span>
          </div>
        </div>

        {/* Public Mission & Camera & Private Jet Buttons */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* Supreme Governor Crest Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/60 text-amber-300 text-xs font-bold shadow-lg shadow-amber-950/40">
            <Crown size={14} className="text-amber-400 fill-amber-400" />
            <span className="tracking-wide">SUPREME GOVERNOR</span>
          </div>

          {/* Sovereign-X1 Private Jet Board / Land Button */}
          <button
            type="button"
            onClick={() => {
              if (onToggleJetFlight) {
                onToggleJetFlight(!playerState.isPilotingJet);
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border shadow-lg ${
              playerState.isPilotingJet
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white border-rose-400 shadow-rose-900/50 animate-pulse'
                : 'bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white border-cyan-400 shadow-cyan-950/50'
            }`}
            title="Board or Land the Sovereign-X1 Private Jet (Shortcut: G)"
          >
            <Plane size={14} className={playerState.isPilotingJet ? 'rotate-90' : ''} />
            <span>{playerState.isPilotingJet ? '🛬 Land Jet [G]' : '✈️ Sovereign-X1 Jet [G]'}</span>
          </button>

          {/* 2-Way Live Comms [E] Button */}
          <button
            type="button"
            onClick={() => {
              if (document.pointerLockElement) {
                try {
                  document.exitPointerLock();
                } catch (_) {}
              }
              const targetId = nearbyAgent?.id || (agentCharacters.length > 0 ? agentCharacters[0].id : 'agent-coordinator');
              if (onInteractWithAgent) onInteractWithAgent(targetId);
            }}
            className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-2 border border-emerald-400 transition"
            title="Open 2-Way Live Comms with Citizens (Shortcut: E)"
          >
            <MessageSquare size={14} className="text-emerald-200" />
            <span>🎙️ Comms [E]</span>
          </button>

          <button
            onClick={onOpenPublicMissions}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-2 transition"
          >
            <Sparkles size={14} className="text-amber-300" />
            <span>[M] Missions ({publicMissions.length})</span>
          </button>

          <TaskHistoryPanel />

          <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl p-1 flex items-center gap-1 text-[11px]">
            <button
              onClick={() => onSelectCameraMode('FPV')}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1 ${
                cameraMode === 'FPV' || cameraMode === 'JET_COCKPIT' 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="First-Person View (Shortcut: V)"
            >
              <Eye size={12} />
              <span>1st Person [V]</span>
            </button>
            <button
              onClick={() => onSelectCameraMode('TPV')}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1 ${
                cameraMode === 'TPV' || cameraMode === 'SHOULDER_CAM' || cameraMode === 'JET_CHASE' 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Third-Person View (Shortcut: V)"
            >
              <Users size={12} />
              <span>3rd Person</span>
            </button>
            <button
              onClick={() => onSelectCameraMode('ORBIT')}
              className={`px-2.5 py-1 rounded transition ${cameraMode === 'ORBIT' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              Orbit
            </button>
          </div>
        </div>
      </div>

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

        {/* Proximity Interaction Prompt when approaching an agent */}
        {nearbyAgent && !interactingAgent && (
          <div 
            onClick={() => onInteractWithAgent ? onInteractWithAgent(nearbyAgent.id) : null}
            className="mt-8 bg-[#070B14]/95 backdrop-blur-md border border-emerald-500/80 rounded-2xl px-6 py-3.5 shadow-2xl flex items-center gap-5 text-xs text-slate-100 border-2 pointer-events-auto cursor-pointer hover:bg-slate-900/90 transition select-none"
            title="Press E or click to open 2-Way Live Comms"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-emerald-500 text-black font-black flex items-center justify-center text-xs shadow-md">
                E
              </span>
              <span>
                <strong>2-Way Live Comms</strong> with <strong className="text-emerald-400">{nearbyAgent.name}</strong>
                <span 
                  className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase border"
                  style={{
                    backgroundColor: `${nearbyAgent.aiModelBadgeColor}20`,
                    borderColor: nearbyAgent.aiModelBadgeColor,
                    color: nearbyAgent.aiModelBadgeColor
                  }}
                >
                  {nearbyAgent.aiProvider} • {nearbyAgent.aiModel}
                </span>
                <span className="text-slate-400 ml-1.5 font-medium">({nearbyAgent.profession})</span>
              </span>
            </div>
            <div className="h-5 w-px bg-slate-700" />
            <div 
              className="flex items-center gap-2 hover:opacity-80 transition"
              onClick={(e) => {
                e.stopPropagation();
                onDirectWorkCommand(nearbyAgent.id);
              }}
              title="Command this citizen to work immediately (Shortcut: F)"
            >
              <span className="w-6 h-6 rounded-lg bg-amber-400 text-black font-black flex items-center justify-center text-xs shadow-md">
                F
              </span>
              <span className="text-amber-300 font-bold hover:underline">
                Make Them Work ([F] Direct Order)
              </span>
            </div>
          </div>
        )}

        {/* Pointer Lock Help Banner when not locked */}
        {!playerState.isPointerLocked && !interactingAgent && !showPublicMissionsModal && (
          <div className="mt-4 bg-slate-900/90 border border-slate-700/80 rounded-xl px-5 py-2 text-[11px] text-slate-200 shadow-xl pointer-events-none flex items-center gap-2.5 backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Click screen to lock cursor • W/A/S/D to move • [V] 1st/3rd Person View • [E] 2-Way Comms • [G] Private Jet</span>
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
                <span>Task History & Deliverables ({interactingAgent.taskHistory.length})</span>
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
                {interactingAgent.taskHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">No task history recorded yet.</div>
                ) : (
                  interactingAgent.taskHistory.map(item => (
                    <div key={item.id} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-200">{item.title}</span>
                        <span className="text-slate-500">{item.completedAt}</span>
                      </div>
                      <div className="text-[10px] text-emerald-400">Result: {item.deliverable}</div>
                      {onViewArtifact && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => onViewArtifact(item.id)}
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
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
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
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

      {/* 5. BOTTOM NOTIFICATION FEED */}
      <div className="p-4 pointer-events-auto">
        <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl px-4 py-2 shadow-2xl flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-slate-100 uppercase text-[11px]">Metropolis Status:</span>
            <span className="text-slate-400 text-[11px]">
              {events[0]?.message || 'All 15 AI citizens operating autonomously across city districts.'}
            </span>
          </div>

          <div className="text-[10px] text-slate-500">
            Press [E] to interact with citizens • [M] for Public Missions • Esc to unlock cursor
          </div>
        </div>
      </div>
    </div>
  );
};
