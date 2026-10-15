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
  Briefcase
} from 'lucide-react';
import { 
  CityMetrics, 
  SimulationEvent, 
  CameraMode, 
  AgentCharacter,
  AgentTask,
  PublicMission,
  PlayerState 
} from '../../simulation/types';

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
  onSelectCameraMode: (mode: CameraMode) => void;
  onCloseAgentInteraction: () => void;
  onOpenPublicMissions: () => void;
  onClosePublicMissions: () => void;
  onAssignIndividualTask: (agentId: string, task: { title: string; description: string; expectedDeliverable: string; priority: AgentTask['priority'] }) => void;
  onPublishPublicMission: (mission: { title: string; description: string; category: PublicMission['category'] }) => void;
  onRequestAgentStatus: (agentId: string) => string;
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
  onCloseAgentInteraction,
  onOpenPublicMissions,
  onClosePublicMissions,
  onAssignIndividualTask,
  onPublishPublicMission,
  onRequestAgentStatus
}) => {
  // Individual task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDeliverable, setTaskDeliverable] = useState('');
  const [taskPriority, setTaskPriority] = useState<AgentTask['priority']>('HIGH');
  const [agentDialogResponse, setAgentDialogResponse] = useState<string | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState<'PROFILE' | 'ASSIGN' | 'HISTORY'>('ASSIGN');

  // Public mission form state
  const [missionTitle, setMissionTitle] = useState('');
  const [missionDesc, setMissionDesc] = useState('');
  const [missionCategory, setMissionCategory] = useState<PublicMission['category']>('SOFTWARE');

  const nearbyAgent = agentCharacters.find(a => a.id === playerState.nearbyAgentId);

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

  const handleTalkInquire = (questionType: string) => {
    if (!interactingAgent) return;
    if (questionType === 'STATUS') {
      const resp = interactingAgent.activeTask 
        ? `I am currently executing "${interactingAgent.activeTask.title}" (${interactingAgent.workProgress.toFixed(0)}% complete). Expecting deliverable: ${interactingAgent.activeTask.expectedDeliverable}.`
        : `Standing by in ${interactingAgent.department}. No active blockers. Ready for new mission directives.`;
      setAgentDialogResponse(resp);
    } else if (questionType === 'SKILLS') {
      setAgentDialogResponse(`My core competencies include: ${interactingAgent.skills.join(', ')}. Active toolchain: ${interactingAgent.toolsInUse.join(', ')}.`);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden font-mono">
      {/* 1. TOP MINIMAL EXPLORATION BAR */}
      <div className="p-4 flex items-center justify-between">
        {/* Compass & Location Tag */}
        <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl px-4 py-2 pointer-events-auto flex items-center gap-4 text-xs shadow-2xl">
          <div className="flex items-center gap-2 text-slate-100">
            <Compass size={15} className="text-blue-400 animate-spin-slow" />
            <span className="font-bold tracking-wider">FORGE AI METROPOLIS</span>
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

        {/* Public Mission & Camera Buttons */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <button
            onClick={onOpenPublicMissions}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-2 transition"
          >
            <Sparkles size={14} className="text-amber-300" />
            <span>[M] Public Missions ({publicMissions.length})</span>
          </button>

          <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl p-1 flex items-center gap-1 text-[11px]">
            <button
              onClick={() => onSelectCameraMode('FPV')}
              className={`px-2.5 py-1 rounded transition ${cameraMode === 'FPV' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              1st Person
            </button>
            <button
              onClick={() => onSelectCameraMode('SHOULDER_CAM')}
              className={`px-2.5 py-1 rounded transition ${cameraMode === 'SHOULDER_CAM' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              3rd Person
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
          <div className="mt-8 bg-[#090D18]/95 backdrop-blur border border-emerald-500/50 rounded-xl px-5 py-2.5 shadow-2xl flex items-center gap-3 text-xs text-slate-100 animate-bounce">
            <span className="w-5 h-5 rounded-md bg-emerald-500 text-black font-bold flex items-center justify-center text-[11px]">
              E
            </span>
            <span>
              Interact with <strong className="text-emerald-400">{nearbyAgent.name}</strong> ({nearbyAgent.profession})
            </span>
          </div>
        )}

        {/* Pointer Lock Help Banner when not locked */}
        {!playerState.isPointerLocked && !interactingAgent && !showPublicMissionsModal && (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL') && (
          <div className="mt-4 bg-slate-900/80 border border-slate-700/60 rounded-lg px-4 py-1.5 text-[11px] text-slate-300">
            Click screen to lock cursor & explore with W/A/S/D • Space to jump • Shift to sprint
          </div>
        )}
      </div>

      {/* 3. PROXIMITY AGENT INTERACTION PANEL (When pressing E) */}
      {interactingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-[#090E1A] border border-blue-500/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-xs">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#060A13]">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-lg"
                  style={{ backgroundColor: interactingAgent.color }}
                >
                  {interactingAgent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>{interactingAgent.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40">
                      {interactingAgent.availability}
                    </span>
                  </h2>
                  <div className="text-[11px] text-slate-400">{interactingAgent.profession}</div>
                </div>
              </div>

              <button 
                onClick={onCloseAgentInteraction}
                className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Interaction Tabs */}
            <div className="flex border-b border-slate-800 bg-[#070C16] text-[11px]">
              <button
                onClick={() => setActiveAgentTab('ASSIGN')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'ASSIGN' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <Briefcase size={13} />
                <span>Assign Direct Task</span>
              </button>
              <button
                onClick={() => setActiveAgentTab('PROFILE')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'PROFILE' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <MessageSquare size={13} />
                <span>Talk & Inquire</span>
              </button>
              <button
                onClick={() => setActiveAgentTab('HISTORY')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${activeAgentTab === 'HISTORY' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-950/20' : 'text-slate-400 hover:text-white'}`}
              >
                <History size={13} />
                <span>Task History ({interactingAgent.taskHistory.length})</span>
              </button>
            </div>

            {/* Tab 1: Assign Direct Task */}
            {activeAgentTab === 'ASSIGN' && (
              <form onSubmit={handleAssignTask} className="p-5 space-y-4">
                {interactingAgent.activeTask && (
                  <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-bold">Currently Executing:</span>
                      <span className="text-emerald-400 font-bold">{interactingAgent.workProgress.toFixed(0)}%</span>
                    </div>
                    <div className="text-slate-200 font-bold">{interactingAgent.activeTask.title}</div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full" style={{ width: `${interactingAgent.workProgress}%` }} />
                    </div>
                  </div>
                )}

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

            {/* Tab 2: Talk & Inquire */}
            {activeAgentTab === 'PROFILE' && (
              <div className="p-5 space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleTalkInquire('STATUS')}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 text-slate-200 text-xs"
                  >
                    "What are you working on?"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTalkInquire('SKILLS')}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 text-slate-200 text-xs"
                  >
                    "What are your core skills?"
                  </button>
                </div>

                {agentDialogResponse && (
                  <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3.5 text-blue-200 text-xs leading-relaxed">
                    <strong className="text-blue-400 font-bold block mb-1">{interactingAgent.name}:</strong>
                    &gt; {agentDialogResponse}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-[11px] pt-2">
                  <div>
                    <div className="text-slate-500 uppercase text-[10px] font-bold">Skills:</div>
                    <div className="text-slate-300 mt-1 space-y-0.5">
                      {interactingAgent.skills.map(s => <div key={s}>• {s}</div>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[10px] font-bold">Tools In Use:</div>
                    <div className="text-slate-300 mt-1 space-y-0.5">
                      {interactingAgent.toolsInUse.map(t => <div key={t}>• {t}</div>)}
                    </div>
                  </div>
                </div>
              </div>
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
                        m.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
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
                              st.status === 'WORKING' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-800 text-slate-400'
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

      {/* 5. BOTTOM NOTIFICATION FEED */}
      <div className="p-4 pointer-events-auto">
        <div className="bg-[#070B14]/90 backdrop-blur border border-slate-800 rounded-xl px-4 py-2 shadow-2xl flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-slate-100 uppercase text-[11px]">Metropolis Status:</span>
            <span className="text-slate-400 text-[11px]">
              {events[0]?.message || 'All 10 AI citizens operating autonomously across city districts.'}
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
