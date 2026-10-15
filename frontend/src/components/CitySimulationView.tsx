import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CitySimulationEngine } from '../simulation/engine';
import { CityGovernmentCouncil } from '../simulation/agents';
import { CityScene } from './city3d/CityScene';
import { CityHUD } from './city3d/CityHUD';
import { 
  CameraMode, 
  OverlayMode, 
  AgentObservation,
  SimulationEvent,
  CityMetrics,
  AgentCharacter,
  PublicMission,
  AgentTask,
  PlayerState
} from '../simulation/types';

export const CitySimulationView: React.FC = () => {
  const engineRef = useRef<CitySimulationEngine>(new CitySimulationEngine());
  const councilRef = useRef<CityGovernmentCouncil>(new CityGovernmentCouncil());

  // Primary First-Person exploration & simulation state
  const [cameraMode, setCameraMode] = useState<CameraMode>('FPV');
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

  // Background government council / notifications
  const [events, setEvents] = useState<SimulationEvent[]>(councilRef.current.events);

  // Find currently interacting agent
  const interactingAgent = interactingAgentId 
    ? agentCharacters.find(a => a.id === interactingAgentId) || null 
    : null;

  // Authoritative 60 FPS simulation loop
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

      // Authoritative engine tick
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

  // Direct Work Command ([F] Key or Interface Button)
  const [workToast, setWorkToast] = useState<string | null>(null);

  const handleDirectWorkCommand = useCallback((agentId: string) => {
    const engine = engineRef.current;
    const res = engine.directWorkCommand(agentId);
    setAgentCharacters([...engine.agentCharacters]);
    
    // Show toast notification
    setWorkToast(res.message);
    setTimeout(() => {
      setWorkToast(prev => prev === res.message ? null : prev);
    }, 4500);

    return res;
  }, []);

  // 2-Way Chat Message Dispatch
  const handleSendChatMessage = useCallback((agentId: string, message: string) => {
    const engine = engineRef.current;
    engine.interactWithAgent(agentId, message);
    setAgentCharacters([...engine.agentCharacters]);
  }, []);

  // Assign direct task to selected agent
  const handleAssignIndividualTask = useCallback((
    agentId: string, 
    taskData: { title: string; description: string; expectedDeliverable: string; priority: AgentTask['priority'] }
  ) => {
    const engine = engineRef.current;
    engine.assignIndividualTask(agentId, taskData);
    setAgentCharacters([...engine.agentCharacters]);
  }, []);

  // Publish city-wide public mission
  const handlePublishPublicMission = useCallback((missionData: { title: string; description: string; category: PublicMission['category'] }) => {
    const engine = engineRef.current;
    engine.publishPublicMission(missionData);
    setPublicMissions([...engine.publicMissions]);
    setActiveMissionId(engine.activeMissionId);
    setAgentCharacters([...engine.agentCharacters]);
  }, []);

  // Request status report from agent
  const handleRequestAgentStatus = useCallback((agentId: string) => {
    const agent = engineRef.current.agentCharacters.find(a => a.id === agentId);
    if (!agent) return 'Agent not found in registry.';
    if (agent.activeTask) {
      return `Currently ${agent.status}: "${agent.activeTask.title}" (${agent.workProgress.toFixed(0)}% complete). Deliverable: ${agent.activeTask.expectedDeliverable}`;
    }
    return `Currently ${agent.status}. Status: ${agent.thoughtBubble || 'Available'}. Skills: ${agent.skills.join(', ')}.`;
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
      />

      {/* First-Person HUD, Interaction Prompts, Agent Profile Modal, and Public Missions */}
      <CityHUD
        metrics={metrics}
        agentCharacters={agentCharacters}
        publicMissions={publicMissions}
        activeMissionId={activeMissionId}
        events={events}
        simulationTime={simulationTime}
        cameraMode={cameraMode}
        playerState={playerState}
        interactingAgent={interactingAgent}
        showPublicMissionsModal={showPublicMissionsModal}
        onSelectCameraMode={setCameraMode}
        onCloseAgentInteraction={handleCloseAgentInteraction}
        onOpenPublicMissions={handleOpenPublicMissions}
        onClosePublicMissions={handleClosePublicMissions}
        onAssignIndividualTask={handleAssignIndividualTask}
        onDirectWorkCommand={handleDirectWorkCommand}
        onSendChatMessage={handleSendChatMessage}
        onPublishPublicMission={handlePublishPublicMission}
        onRequestAgentStatus={handleRequestAgentStatus}
      />
    </div>
  );
};

