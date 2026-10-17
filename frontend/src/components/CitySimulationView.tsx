import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CitySimulationEngine } from '../simulation/engine';
import { CityGovernmentCouncil } from '../simulation/agents';
import { CityScene } from './city3d/CityScene';
import { CityHUD } from './city3d/CityHUD';
import { api } from '../api/client';
import { DeliverableArtifact } from '../types';
import { Sparkles, Globe, ExternalLink, X } from 'lucide-react';
import { 
  CameraMode, 
  OverlayMode, 
  SimulationEvent, 
  CityMetrics, 
  AgentCharacter, 
  PublicMission, 
  AgentTask, 
  PlayerState,
  AgentChatMessage
} from '../simulation/types';

function mapBackendStatus(backendStatus: string): AgentCharacter['status'] {
  switch (backendStatus?.toLowerCase()) {
    case 'idle': return 'IDLE';
    case 'planning': return 'EVALUATING';
    case 'working': return 'WORKING';
    case 'testing': return 'VERIFYING';
    case 'completed': return 'COMPLETED';
    case 'verifying':
    case 'repairing': return 'VERIFYING';
    case 'failed':
    case 'blocked': return 'BLOCKED';
    default: return 'IDLE';
  }
}

function mapTaskStatus(taskStatus: string): AgentTask['status'] {
  switch (taskStatus?.toLowerCase()) {
    case 'pending': return 'PENDING';
    case 'queued': return 'PENDING';
    case 'assigned': return 'ASSIGNED';
    case 'planning': return 'ASSIGNED';
    case 'working': return 'WORKING';
    case 'testing': return 'VERIFYING';
    case 'completed': return 'COMPLETED';
    case 'verified': return 'COMPLETED';
    case 'verifying':
    case 'repairing': return 'VERIFYING';
    case 'failed': return 'FAILED';
    case 'blocked': return 'BLOCKED';
    default: return 'ASSIGNED';
  }
}

const BUSY = ['PLANNING', 'WORKING', 'TESTING', 'VERIFYING'];

/**
 * Writes the backend's citizen state (/api/agents) into the 3D characters. This is the only source of
 * status, current task, progress, model and thoughts; when the backend is unreachable every citizen is
 * marked offline instead of keeping (or inventing) activity.
 */
function applyBackendCitizens(engine: CitySimulationEngine, list: any[] | null, showThoughts: boolean): void {
  const online = Array.isArray(list);
  for (const ag of engine.agentCharacters) {
    const bc = online ? list!.find((x: any) => x.id === ag.id) : null;
    if (!bc) {
      ag.live = { online: false, status: 'OFFLINE', task: null, progress: 0, thought: null };
      ag.activeTask = null;
      ag.thoughtBubble = undefined;
      continue;
    }
    const status = String(bc.status || 'IDLE').toUpperCase();
    const thought: string | null = bc.thought || null;
    const progress = Math.max(0, Math.min(100, Number(bc.work_progress) || 0));
    if (!showThoughts && !ag.live) ag.thoughtBubble = undefined;   // first sync: nothing that did not come from the backend
    if ((showThoughts || BUSY.includes(status)) && thought && thought !== ag.live?.thought) {
      ag.thoughtBubble = thought;
      ag.speechTimer = 9;
    }
    ag.live = { online: true, status, task: bc.current_task || null, progress, thought };
    if (bc.assigned_model) ag.aiModel = bc.assigned_model;
    if (bc.provider) ag.aiProvider = bc.provider;
    ag.activeTask = BUSY.includes(status) && bc.current_task ? {
      id: bc.active_task_id || `live-${ag.id}`,
      title: bc.current_task,
      description: '',
      expectedDeliverable: '',
      priority: 'HIGH',
      status: mapTaskStatus(status),
      progress,
      assignedAgentId: ag.id,
      assignedAgentName: ag.name,
      source: 'INDIVIDUAL',
      requiredSkills: [],
      dependencies: [],
      createdAt: '',
    } : null;
  }
}

/** Backend missions (/api/missions) in the shape the 3D view uses. */
function mapBackendMissions(list: any[]): PublicMission[] {
  return list.map((bm: any) => ({
    id: bm.id,
    title: bm.title,
    description: bm.description,
    category: (bm.category || 'SOFTWARE') as PublicMission['category'],
    status: (bm.status === 'IN_PROGRESS' || bm.status === 'COMPLETED' || bm.status === 'PARTIAL' || bm.status === 'FAILED' || bm.status === 'CANCELLED' ? bm.status : 'IN_PROGRESS') as PublicMission['status'],
    progress: bm.progress || 0,
    subtasks: (bm.subtasks || []).map((st: any) => ({
      id: st.id,
      title: st.title,
      description: st.error || '',
      expectedDeliverable: st.expected_deliverable || '',
      priority: 'HIGH',
      status: mapTaskStatus(st.status),
      progress: st.progress || 0,
      assignedAgentId: st.assigned_agent_id,
      assignedAgentName: st.assigned_agent_name,
      source: 'PUBLIC_MISSION',
      publicMissionId: bm.id,
      requiredSkills: [],
      dependencies: st.dependencies || [],
      createdAt: '',
      deliverableResult: Array.isArray(st.deliverable_result) ? st.deliverable_result.join(', ') : undefined,
    })),
    participatingAgentIds: bm.participating_agent_ids || (bm.subtasks || []).map((st: any) => st.assigned_agent_id),
    blockers: (bm.subtasks || []).filter((st: any) => st.status === 'BLOCKED' || st.status === 'FAILED').map((st: any) => st.error || st.title),
    acceptanceCriteria: [],
    deliverables: bm.deliverables || [],
    publishedAt: bm.published_at || '',
    completedAt: bm.completed_at || undefined,
  }));
}

export const CitySimulationView: React.FC = () => {
  const engineRef = useRef<CitySimulationEngine>(new CitySimulationEngine());
  const councilRef = useRef<CityGovernmentCouncil>(new CityGovernmentCouncil());

  // Primary First-Person exploration & simulation state
  // Street-level third-person camera by default (GTA style); V toggles first person
  const [cameraMode, setCameraMode] = useState<CameraMode>('TPV');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('NONE');
  const [metrics, setMetrics] = useState<CityMetrics>(engineRef.current.metrics);
  const [simulationTime, setSimulationTime] = useState<number>(engineRef.current.simulationTime);
  const [agentCharacters, setAgentCharacters] = useState<AgentCharacter[]>(engineRef.current.agentCharacters);
  const [publicMissions, setPublicMissions] = useState<PublicMission[]>(engineRef.current.publicMissions);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(engineRef.current.activeMissionId);
  const [playerState, setPlayerState] = useState<PlayerState>(engineRef.current.player);

  // Modal / Interaction states
  const [interactingAgentId, setInteractingAgentId] = useState<string | null>(null);
  const [showPublicMissionsModal, setShowPublicMissionsModal] = useState<boolean>(false);
  const [selectedArtifact, setSelectedArtifact] = useState<DeliverableArtifact | null>(null);
  const [activeDeliverablePreview, setActiveDeliverablePreview] = useState<{ url: string; title: string; type: string } | null>(null);

  // Background government council / notifications
  const [events, setEvents] = useState<SimulationEvent[]>(councilRef.current.events);
  const [workToast, setWorkToast] = useState<string | null>(null);

  // Find currently interacting agent
  const interactingAgent = interactingAgentId 
    ? agentCharacters.find(a => a.id === interactingAgentId) || null 
    : null;

  // Authoritative 60 FPS simulation loop (3D movement, vehicles, lighting)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let councilAccumulator = 0;

    const loop = (currentTime: number) => {
      animId = requestAnimationFrame(loop);
      const delta = Math.min((currentTime - lastTime) / 1000.0, 0.1); // clamp delta
      lastTime = currentTime;

      const engine = engineRef.current;
      const council = councilRef.current;

      // Authoritative engine tick for 3D physics, vehicles, and navigation
      engine.tick(delta);
      councilAccumulator += delta;

      // Background council evaluation
      if (councilAccumulator >= 2.0 / Math.max(1, engine.simulationSpeed)) {
        councilAccumulator = 0;
        council.evaluateAndAct(engine);
        setEvents([...council.events]);
      }

      // Sync state to React
      if (engine.tickCount % 4 === 0) {
        setMetrics({ ...engine.metrics });
        setSimulationTime(engine.simulationTime);
        setAgentCharacters([...engine.agentCharacters]);
        setPublicMissions([...engine.publicMissions]);
        setActiveMissionId(engine.activeMissionId);
        setPlayerState({ ...engine.player });
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Periodic synchronization with the backend: the only source of citizen activity and missions
  useEffect(() => {
    let isMounted = true;
    let first = true;

    const syncWithBackend = async () => {
      const engine = engineRef.current;
      let citizens: any[] | null = null;
      let missions: any[] | null = null;
      try {
        [citizens, missions] = await Promise.all([api.listAgents(), api.listPublicMissions()]);
      } catch {
        citizens = null;   // offline: shown as offline, nothing is simulated in its place
      }
      if (!isMounted) return;
      applyBackendCitizens(engine, citizens, !first);
      first = false;
      if (Array.isArray(missions)) {
        engine.publicMissions = mapBackendMissions(missions);
        setPublicMissions(engine.publicMissions);
      }
      setAgentCharacters([...engine.agentCharacters]);
    };

    syncWithBackend();
    const interval = setInterval(syncWithBackend, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // After any action, pull the real state right away instead of guessing it locally
  const refreshFromBackend = useCallback(async () => {
    const engine = engineRef.current;
    try {
      const [citizens, missions] = await Promise.all([api.listAgents(), api.listPublicMissions()]);
      applyBackendCitizens(engine, citizens, true);
      engine.publicMissions = mapBackendMissions(missions);
      setPublicMissions(engine.publicMissions);
    } catch {
      applyBackendCitizens(engine, null, false);
    }
    setAgentCharacters([...engine.agentCharacters]);
  }, []);

  // Player position update handler from CityScene controls
  const handleUpdatePlayer = useCallback((update: Partial<PlayerState>) => {
    const engine = engineRef.current;
    Object.assign(engine.player, update);
    setPlayerState({ ...engine.player });
  }, []);

  // Agent interaction triggers
  const handleInteractWithAgent = useCallback((agentId: string) => {
    setInteractingAgentId(agentId);
  }, []);

  const handleCloseAgentInteraction = useCallback(() => {
    setInteractingAgentId(null);
  }, []);

  // Public missions modal toggles
  const handleOpenPublicMissions = useCallback(() => {
    setShowPublicMissionsModal(true);
  }, []);

  const handleClosePublicMissions = useCallback(() => {
    setShowPublicMissionsModal(false);
  }, []);

  // Direct Work Command ([F] Key or Interface Button): sends the citizen's standard role task to the backend
  const handleDirectWorkCommand = useCallback(async (agentId: string) => {
    const engine = engineRef.current;
    const ag = engine.agentCharacters.find(a => a.id === agentId);
    if (!ag) return;

    // Build role-tailored real task
    let title = 'Implement System Solution';
    let description = 'Execute domain task using verified tools and local model.';
    let expectedDeliverable = 'solution_output.py';

    if (ag.id === 'agent-engineer') {
      title = 'Implement Python Downloads File Organizer';
      description = 'Create a Python application with unit tests that organizes downloaded files by extension.';
      expectedDeliverable = 'file_organizer.py';
    } else if (ag.id === 'agent-qa') {
      title = 'Synthesize Pytest Automated Test Suite';
      description = 'Create automated unit tests with edge-case validation and assertion fixtures.';
      expectedDeliverable = 'test_suite.py';
    } else if (ag.id === 'agent-architect') {
      title = 'Design Normalized Database Schema DDL';
      description = 'Design SQLite relational schema with foreign key constraints and type-safe migrations.';
      expectedDeliverable = 'schema_ddl.sql';
    } else if (ag.id === 'agent-analyst') {
      title = 'Draft Technical PRD & Acceptance Criteria';
      description = 'Draft comprehensive Product Requirements Document with 10 verifiable acceptance criteria.';
      expectedDeliverable = 'technical_prd.md';
    } else if (ag.id === 'agent-devops') {
      title = 'Generate Production Multi-Stage Dockerfile';
      description = 'Write hardened production Dockerfile with non-root user and healthcheck instruction.';
      expectedDeliverable = 'Dockerfile';
    } else if (ag.id === 'agent-security') {
      title = 'Audit Filesystem Path Containment';
      description = 'Verify path traversal containment and jail boundary enforcement.';
      expectedDeliverable = 'security_audit_report.json';
    } else if (ag.id === 'agent-diagnostic') {
      title = 'Run Automated RCA System Diagnostics';
      description = 'Analyze execution telemetry traces, memory heap boundaries, and exceptions.';
      expectedDeliverable = 'diagnostic_trace_report.md';
    } else if (ag.id === 'agent-constructor') {
      title = 'Draft Structural Civil Calculations';
      description = 'Draft engineering load calculations and foundation specifications.';
      expectedDeliverable = 'civil_structural_specs.txt';
    } else if (ag.id === 'agent-doctor') {
      title = 'Formulate Medical Emergency Triage Protocol';
      description = 'Draft emergency trauma triage protocol and intensive care checklist.';
      expectedDeliverable = 'triage_protocol.md';
    } else {
      title = 'Decompose National Mission Plan';
      description = 'Decompose top-level governance directive into an acyclic dependency graph.';
      expectedDeliverable = 'mission_dag_plan.json';
    }

    try {
      await api.assignAgentTask(agentId, {
        title,
        description,
        expectedDeliverable,
        priority: 'CRITICAL'
      });
      setWorkToast(`⚡ Work order sent to ${ag.name}: ${title}`);
      await refreshFromBackend();
    } catch (err: any) {
      console.error('Failed to dispatch direct work command to backend:', err);
      setWorkToast(`⚠️ Could not reach the backend: the work order for ${ag.name} was not sent.`);
    }
    setTimeout(() => setWorkToast(null), 4500);
  }, []);

  // 2-Way Conversational Chat with Local Model
  const handleSendChatMessage = useCallback(async (agentId: string, message: string) => {
    const engine = engineRef.current;
    const ag = engine.agentCharacters.find(a => a.id === agentId);
    if (!ag) return;

    if (!ag.chatHistory) ag.chatHistory = [];
    const playerMsg = {
      id: `pmsg-${Date.now()}`,
      sender: 'PLAYER' as const,
      senderName: 'Supreme Governor',
      text: message,
      timestamp: new Date().toLocaleTimeString()
    };
    ag.chatHistory.push(playerMsg);
    // Visible "thinking" line in the chat until the local model answers (can take a while on first load).
    const pendingId = `pending-${Date.now()}`;
    ag.chatHistory.push({
      id: pendingId,
      sender: 'AGENT' as const,
      senderName: ag.name,
      text: `${ag.name} is thinking…`,
      timestamp: new Date().toLocaleTimeString()
    });
    ag.thoughtBubble = 'Thinking via local Ollama model...';
    ag.speechTimer = 10.0;
    setAgentCharacters([...engine.agentCharacters]);
    const dropPending = () => { ag.chatHistory = (ag.chatHistory || []).filter(m => m.id !== pendingId); };

    try {
      const response = await api.chatWithAgent(agentId, message);
      dropPending();
      ag.chatHistory.push({
        id: response.message_id || `amsg-${Date.now()}`,
        sender: 'AGENT' as const,
        senderName: `${response.agent_name} [${response.model_used}]`,
        text: response.reply,
        timestamp: new Date().toLocaleTimeString(),
        actionTaken: response.action_taken,
        deliverableTitle: response.deliverable_title,
        deliverableUrl: response.deliverable_url,
        deliverablePath: response.deliverable_path,
        deliverableType: response.deliverable_type as AgentChatMessage['deliverableType'],
        artifactId: response.artifact_id
      });
      ag.thoughtBubble = response.reply.slice(0, 36) + '...';
      ag.speechTimer = 6.0;

      if (response.deliverable_title) {
        setWorkToast(`🚀 Deliverable Generated: ${response.deliverable_title}`);
        setTimeout(() => setWorkToast(null), 4500);
      }

      setAgentCharacters([...engine.agentCharacters]);
    } catch (err: any) {
      // Say what went wrong instead of inventing a reply.
      dropPending();
      ag.chatHistory.push({
        id: `err-${Date.now()}`,
        sender: 'AGENT' as const,
        senderName: ag.name,
        text: `⚠️ ${ag.name} could not answer: ${err?.message || 'the City AI backend is not reachable'}. Check that the app (or backend) and Ollama are running, then try again.`,
        timestamp: new Date().toLocaleTimeString()
      });
      ag.thoughtBubble = 'Could not reach my model.';
      setAgentCharacters([...engine.agentCharacters]);
    }
  }, []);

  // Assign direct task to selected agent
  const handleAssignIndividualTask = useCallback(async (
    agentId: string, 
    taskData: { title: string; description: string; expectedDeliverable: string; priority: AgentTask['priority'] }
  ) => {
    const engine = engineRef.current;
    const ag = engine.agentCharacters.find(a => a.id === agentId);
    try {
      await api.assignAgentTask(agentId, taskData);
      setWorkToast(`Task assigned to ${ag?.name || agentId}: ${taskData.title}`);
      await refreshFromBackend();
    } catch (err: any) {
      console.error('Failed to assign task to backend:', err);
      setWorkToast(`⚠️ Could not reach the backend: the task for ${ag?.name || agentId} was not assigned.`);
    }
    setTimeout(() => setWorkToast(null), 4500);
  }, []);

  // Publish city-wide public mission (the backend decomposes and runs it; nothing is simulated locally)
  const handlePublishPublicMission = useCallback(async (missionData: { title: string; description: string; category: PublicMission['category'] }) => {
    try {
      await api.publishPublicMission({
        title: missionData.title,
        description: missionData.description,
        category: missionData.category
      });
      setWorkToast(`Mission published: ${missionData.title}`);
      await refreshFromBackend();
    } catch (err: any) {
      console.error('Failed to publish public mission to backend:', err);
      setWorkToast('⚠️ Could not reach the backend: the mission was not published.');
    }
    setTimeout(() => setWorkToast(null), 4500);
  }, [refreshFromBackend]);

  // Request status report from agent
  const handleRequestAgentStatus = useCallback((agentId: string) => {
    const agent = engineRef.current.agentCharacters.find(a => a.id === agentId);
    if (!agent) return 'Agent not found in registry.';
    if (!agent.live || !agent.live.online) return 'Backend offline: status unknown.';
    if (agent.live.task) {
      return `Currently ${agent.live.status}: "${agent.live.task}" (${agent.live.progress.toFixed(0)}% complete).`;
    }
    return `Currently ${agent.status}. Status: ${agent.thoughtBubble || 'Available'}. Skills: ${agent.skills.join(', ')}.`;
  }, []);

  // Deliverable Artifact Inspection
  const handleViewArtifact = useCallback(async (taskId: string) => {
    try {
      const artifact = await api.getArtifact(taskId);
      setSelectedArtifact(artifact);
    } catch (err: any) {
      console.error('Failed to load deliverable artifact:', err);
      setWorkToast(`Deliverable artifact not found for Task ${taskId}`);
      setTimeout(() => setWorkToast(null), 3500);
    }
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setSelectedArtifact(null);
  }, []);

  // Open deliverable directly on host computer OS
  const handleOpenDeliverableOnComputer = useCallback(async (artifactId: string) => {
    try {
      setWorkToast('🚀 Opening deliverable on your computer desktop...');
      setTimeout(() => setWorkToast(null), 3000);
      await api.openDeliverableOnComputer(artifactId);
    } catch (err: any) {
      console.error('Failed to open deliverable on desktop:', err);
      setWorkToast('Failed to open on desktop: ' + (err.message || 'Error'));
      setTimeout(() => setWorkToast(null), 3500);
    }
  }, []);

  // Open deliverable live in-app sandbox preview
  const handlePreviewDeliverable = useCallback((url: string, title: string, type: string) => {
    setActiveDeliverablePreview({ url, title, type });
  }, []);

  // Sovereign-X1 Private Jet Piloting Toggle
  const handleToggleJetFlight = useCallback((piloting: boolean) => {
    engineRef.current.player.isPilotingJet = piloting;
    if (piloting) {
      setCameraMode('JET_CHASE');
      setPlayerState(prev => ({
        ...prev,
        isPilotingJet: true,
        jetSpeed: prev.jetSpeed || 54,
        jetAltitude: prev.jetAltitude || 12
      }));
      setWorkToast('✈️ Sovereign-X1 Private Jet Engaged: Supersonic Flight active [WASD / Space / Shift]');
      setTimeout(() => setWorkToast(null), 4000);
    } else {
      setCameraMode('TPV');
      setPlayerState(prev => ({
        ...prev,
        isPilotingJet: false,
        jetSpeed: 0,
        jetAltitude: 0
      }));
      setWorkToast('🛬 Sovereign-X1 Landed. Supreme Governor disembarked on foot.');
      setTimeout(() => setWorkToast(null), 3500);
    }
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-65px)] overflow-hidden bg-[#06080E]">
      {/* Floating Work Order Notification Toast */}
      {workToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#070D1A]/95 border-2 border-amber-500 text-amber-200 px-6 py-3 rounded-2xl shadow-2xl text-xs font-mono font-bold flex items-center gap-3 animate-bounce">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span>{workToast}</span>
        </div>
      )}

      {/* 3D WebGL Three.js First-Person Explorable City */}
      <CityScene
        buildings={engineRef.current.buildings}
        roads={engineRef.current.roads}
        intersections={engineRef.current.intersections}
        vehicles={engineRef.current.vehicles}
        pedestrians={engineRef.current.pedestrians}
        agentCharacters={agentCharacters}
        incidents={engineRef.current.incidents}
        simulationTime={simulationTime}
        cameraMode={cameraMode}
        overlayMode={overlayMode}
        selectedEntityId={interactingAgentId}
        selectedAgentId={interactingAgentId}
        playerState={playerState}
        onUpdatePlayer={handleUpdatePlayer}
        onInteractWithAgent={handleInteractWithAgent}
        onDirectWorkCommand={handleDirectWorkCommand}
        onOpenPublicMissions={handleOpenPublicMissions}
        onSelectEntity={(_type, id) => setInteractingAgentId(id)}
        onSelectCameraMode={setCameraMode}
        onToggleJetFlight={handleToggleJetFlight}
      />

      {/* First-Person HUD, Interaction Prompts, Agent Profile Modal, and Public Missions */}
      <CityHUD
        metrics={metrics}
        buildings={engineRef.current.buildings}
        roads={engineRef.current.roads}
        agentCharacters={agentCharacters}
        publicMissions={publicMissions}
        activeMissionId={activeMissionId}
        events={events}
        simulationTime={simulationTime}
        cameraMode={cameraMode}
        playerState={playerState}
        interactingAgent={interactingAgent}
        showPublicMissionsModal={showPublicMissionsModal}
        activeArtifact={selectedArtifact}
        onSelectCameraMode={setCameraMode}
        onToggleJetFlight={handleToggleJetFlight}
        onInteractWithAgent={handleInteractWithAgent}
        onCloseAgentInteraction={handleCloseAgentInteraction}
        onOpenPublicMissions={handleOpenPublicMissions}
        onClosePublicMissions={handleClosePublicMissions}
        onAssignIndividualTask={handleAssignIndividualTask}
        onDirectWorkCommand={handleDirectWorkCommand}
        onSendChatMessage={handleSendChatMessage}
        onPublishPublicMission={handlePublishPublicMission}
        onRequestAgentStatus={handleRequestAgentStatus}
        onViewArtifact={handleViewArtifact}
        onCloseArtifact={handleCloseArtifact}
        onOpenDeliverableOnComputer={handleOpenDeliverableOnComputer}
        onPreviewDeliverable={handlePreviewDeliverable}
      />

      {/* Interactive 3D / Web Live Preview Modal Overlay */}
      {activeDeliverablePreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center pointer-events-auto p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#090E1A] border-2 border-cyan-500/60 rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3.5 bg-gradient-to-r from-slate-950 via-indigo-950/80 to-slate-950 border-b border-cyan-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  {activeDeliverablePreview.type === '3D_PRESENTATION' ? <Sparkles size={18} /> : <Globe size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">
                      {activeDeliverablePreview.type === '3D_PRESENTATION' ? '🪐 Standalone Three.js 3D Presentation' : '🌐 Generated Web Experience'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      LIVE IN-APP SANDBOX
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate max-w-xl">
                    {activeDeliverablePreview.title}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={activeDeliverablePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-cyan-600/30"
                >
                  <ExternalLink size={13} />
                  <span>Open In New Tab</span>
                </a>
                <button
                  type="button"
                  onClick={() => setActiveDeliverablePreview(null)}
                  className="p-1.5 bg-slate-800 hover:bg-rose-950/80 hover:text-rose-400 text-slate-400 rounded-lg transition border border-slate-700"
                  title="Close Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Iframe Viewport */}
            <div className="flex-1 bg-black relative">
              <iframe
                src={activeDeliverablePreview.url}
                title={activeDeliverablePreview.title}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>

            {/* Footer Bar */}
            <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Interactive WebGL / HTML runtime executing in isolated sandbox. Keyboard & click controls active.</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveDeliverablePreview(null)}
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Close Preview [ESC]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
