import { 
  Building, 
  RoadSegment, 
  Intersection, 
  Vehicle, 
  Citizen, 
  Pedestrian, 
  Incident, 
  CityMetrics, 
  ScenarioType, 
  ZoneType, 
  BuildingType, 
  RoofStyle,
  AgentCharacter,
  AgentTask,
  PublicMission,
  PlayerState,
  AgentRoleType,
  AgentChatMessage
} from './types';

export class CitySimulationEngine {
  public buildings: Building[] = [];
  public roads: RoadSegment[] = [];
  public intersections: Intersection[] = [];
  public vehicles: Vehicle[] = [];
  public citizens: Citizen[] = [];
  public pedestrians: Pedestrian[] = [];
  public incidents: Incident[] = [];
  public metrics: CityMetrics;

  // The 10 Living Autonomous AI Agents
  public agentCharacters: AgentCharacter[] = [];
  public publicMissions: PublicMission[] = [];
  public activeMissionId: string | null = null;
  public selectedAgentId: string | null = null;

  // First-person Player State
  public player: PlayerState = {
    x: 0,
    y: 1.8,
    z: 12,
    yaw: 0,
    pitch: 0,
    speed: 5.5,
    isSprinting: false,
    isGrounded: true,
    isPointerLocked: false,
    nearbyAgentId: null,
    nearbyAgentDistance: 999
  };

  public simulationTime: number = 9.5; // 0.0 - 24.0 (Hour of day)
  public simulationSpeed: number = 1.0;
  public tickCount: number = 0;
  public activeScenario: ScenarioType = 'BALANCED_METROPOLIS';

  constructor() {
    this.metrics = this.createDefaultMetrics();
    this.generateCityLayout();
    this.initAIAgentCharacters();
    this.initDefaultPublicMissions();
    this.loadFromStorage();
  }

  private createDefaultMetrics(): CityMetrics {
    return {
      population: 3450,
      employmentRate: 96.8,
      avgCommuteTime: 13.5,
      trafficCongestion: 11.0,
      powerProduction: 340.0,
      powerDemand: 255.0,
      powerGridStatus: 100.0,
      waterSupply: 4500.0,
      waterDemand: 3200.0,
      waterGridStatus: 100.0,
      treasury: 820000,
      incomeRate: 540,
      expenseRate: 270,
      citizenSatisfaction: 94.0,
      activeIncidentsCount: 0,
      carbonIndex: 19.0
    };
  }

  public generateCityLayout(): void {
    this.buildings = [];
    this.roads = [];
    this.intersections = [];
    this.vehicles = [];
    this.citizens = [];
    this.pedestrians = [];
    this.incidents = [];

    // 1. Generate 6x6 Connected Road Network
    const gridSize = 5;
    const spacing = 28;
    const offset = (gridSize * spacing) / 2;

    for (let r = 0; r <= gridSize; r++) {
      for (let c = 0; c <= gridSize; c++) {
        const x = c * spacing - offset;
        const z = r * spacing - offset;
        this.intersections.push({
          id: `inter-${r}-${c}`,
          x,
          z,
          signalState: (r + c) % 2 === 0 ? 'NS_GREEN' : 'EW_GREEN',
          greenDuration: 7.5,
          timer: ((r * 1.5) + (c * 2.2)) % 7.5
        });
      }
    }

    for (let r = 0; r <= gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        this.roads.push({
          id: `road-ew-${r}-${c}`,
          name: `Avenue ${r + 1} E-W`,
          start: [c * spacing - offset, r * spacing - offset],
          end: [(c + 1) * spacing - offset, r * spacing - offset],
          lanes: 2,
          density: 0.08,
          speedLimit: 50,
          isClosed: false,
          orientation: 'EW'
        });
      }
    }

    for (let c = 0; c <= gridSize; c++) {
      for (let r = 0; r < gridSize; r++) {
        this.roads.push({
          id: `road-ns-${c}-${r}`,
          name: `Street ${c + 1} N-S`,
          start: [c * spacing - offset, r * spacing - offset],
          end: [c * spacing - offset, (r + 1) * spacing - offset],
          lanes: 2,
          density: 0.08,
          speedLimit: 50,
          isClosed: false,
          orientation: 'NS'
        });
      }
    }

    // 2. Named AI Department Headquarters & Landmark Buildings
    // Landmark 1: Central Innovation Plaza (Center: 0, 0)
    this.buildings.push({
      id: 'bld-park',
      name: 'Central Innovation Plaza & Public Forum',
      signName: 'INNOVATION PLAZA',
      department: 'Multi-Agent Public Mission Forum',
      zone: 'PARK',
      type: 'PARK_SPACE',
      x: 0,
      z: 0,
      width: 22,
      depth: 22,
      height: 0.5,
      floors: 1,
      roofStyle: 'FLAT',
      facadeColor: '#15803D',
      color: '#15803D',
      roofColor: '#166534',
      accentColor: '#38BDF8',
      residents: 0,
      maxResidents: 0,
      workers: 30,
      maxWorkers: 60,
      powerDemand: 12,
      powerSupplied: true,
      waterDemand: 250,
      waterSupplied: true,
      wasteAccumulated: 2,
      health: 100
    });

    // Landmark 2: Citadel Spire (Master Orchestrator HQ)
    this.buildings.push({
      id: 'bld-citadel',
      name: 'Citadel Spire (Executive Orchestrator HQ)',
      signName: 'CITADEL SPIRE',
      department: 'Executive Master Orchestration & Routing',
      zone: 'COMMERCIAL',
      type: 'SKYSCRAPER',
      x: 0,
      z: -28,
      width: 11,
      depth: 11,
      height: 42,
      floors: 14,
      roofStyle: 'ANTENNA',
      facadeColor: '#0F172A',
      color: '#0F172A',
      roofColor: '#1E293B',
      accentColor: '#38BDF8',
      residents: 0,
      maxResidents: 0,
      workers: 240,
      maxWorkers: 350,
      powerDemand: 45,
      powerSupplied: true,
      waterDemand: 420,
      waterSupplied: true,
      wasteAccumulated: 10,
      health: 100
    });

    // Landmark 3: Product Vision Lab (Analyst HQ)
    this.buildings.push({
      id: 'bld-vision-lab',
      name: 'Product Vision Lab (Requirements & PRD)',
      signName: 'VISION LAB',
      department: 'Product Strategy & User Story Mapping',
      zone: 'COMMERCIAL',
      type: 'SKYSCRAPER',
      x: 28,
      z: 0,
      width: 9.5,
      depth: 9.5,
      height: 32,
      floors: 10,
      roofStyle: 'HELIPAD',
      facadeColor: '#581C87',
      color: '#581C87',
      roofColor: '#3B0764',
      accentColor: '#C084FC',
      residents: 0,
      maxResidents: 0,
      workers: 180,
      maxWorkers: 250,
      powerDemand: 30,
      powerSupplied: true,
      waterDemand: 310,
      waterSupplied: true,
      wasteAccumulated: 12,
      health: 100
    });

    // Landmark 4: Software Blueprint Complex (Architect HQ)
    this.buildings.push({
      id: 'bld-blueprint',
      name: 'Blueprint Complex (Software & Civil Architecture)',
      signName: 'BLUEPRINT COMPLEX',
      department: 'System Architecture & Schema Engineering',
      zone: 'COMMERCIAL',
      type: 'SKYSCRAPER',
      x: 28,
      z: -28,
      width: 10,
      depth: 10,
      height: 36,
      floors: 12,
      roofStyle: 'FLAT',
      facadeColor: '#1E3A8A',
      color: '#1E3A8A',
      roofColor: '#172554',
      accentColor: '#60A5FA',
      residents: 0,
      maxResidents: 0,
      workers: 210,
      maxWorkers: 300,
      powerDemand: 38,
      powerSupplied: true,
      waterDemand: 360,
      waterSupplied: true,
      wasteAccumulated: 15,
      health: 100
    });

    // Landmark 5: Fabrication Foundry (Implementation & Coding)
    this.buildings.push({
      id: 'bld-foundry',
      name: 'Fabrication Foundry (Code Synthesis)',
      signName: 'FABRICATION FOUNDRY',
      department: 'Full-Stack Implementation & AST Synthesis',
      zone: 'INDUSTRIAL',
      type: 'FACTORY',
      x: -28,
      z: 28,
      width: 11,
      depth: 10,
      height: 22,
      floors: 6,
      roofStyle: 'CHIMNEY',
      facadeColor: '#78350F',
      color: '#78350F',
      roofColor: '#451A03',
      accentColor: '#F59E0B',
      residents: 0,
      maxResidents: 0,
      workers: 160,
      maxWorkers: 220,
      powerDemand: 52,
      powerSupplied: true,
      waterDemand: 450,
      waterSupplied: true,
      wasteAccumulated: 18,
      health: 100
    });

    // Landmark 6: Quality Assurance Bastion (Testing & CI)
    this.buildings.push({
      id: 'bld-qa-bastion',
      name: 'Quality Assurance Bastion (Testing & CI)',
      signName: 'QA BASTION',
      department: 'Automated Verification & Pytest Suite',
      zone: 'PUBLIC',
      type: 'OFFICE_TOWER',
      x: -28,
      z: -28,
      width: 9.5,
      depth: 9.5,
      height: 28,
      floors: 9,
      roofStyle: 'ANTENNA',
      facadeColor: '#065F46',
      color: '#065F46',
      roofColor: '#064E3B',
      accentColor: '#34D399',
      residents: 0,
      maxResidents: 0,
      workers: 140,
      maxWorkers: 200,
      powerDemand: 32,
      powerSupplied: true,
      waterDemand: 280,
      waterSupplied: true,
      wasteAccumulated: 8,
      health: 100
    });

    // Landmark 7: Diagnostic Core (Debugging & RCA)
    this.buildings.push({
      id: 'bld-diagnostic',
      name: 'Diagnostic Core (Debugging & Fixes)',
      signName: 'DIAGNOSTIC CORE',
      department: 'Traceback Root Cause Analysis & Live Patching',
      zone: 'COMMERCIAL',
      type: 'OFFICE_TOWER',
      x: -28,
      z: 0,
      width: 9,
      depth: 9,
      height: 24,
      floors: 8,
      roofStyle: 'FLAT',
      facadeColor: '#831843',
      color: '#831843',
      roofColor: '#500724',
      accentColor: '#F472B6',
      residents: 0,
      maxResidents: 0,
      workers: 110,
      maxWorkers: 160,
      powerDemand: 28,
      powerSupplied: true,
      waterDemand: 220,
      waterSupplied: true,
      wasteAccumulated: 6,
      health: 100
    });

    // Landmark 8: Security Citadel & Policy Vault
    this.buildings.push({
      id: 'bld-security',
      name: 'Security Citadel (Policy & Sandbox Vault)',
      signName: 'SECURITY CITADEL',
      department: 'Security Review, Sandboxing & Secrets',
      zone: 'PUBLIC',
      type: 'OFFICE_TOWER',
      x: 0,
      z: 28,
      width: 10.5,
      depth: 10.5,
      height: 30,
      floors: 10,
      roofStyle: 'HELIPAD',
      facadeColor: '#7F1D1D',
      color: '#7F1D1D',
      roofColor: '#450A0A',
      accentColor: '#EF4444',
      residents: 0,
      maxResidents: 0,
      workers: 130,
      maxWorkers: 190,
      powerDemand: 34,
      powerSupplied: true,
      waterDemand: 290,
      waterSupplied: true,
      wasteAccumulated: 9,
      health: 100
    });

    // Landmark 9: Cloud Release Dock & DevOps
    this.buildings.push({
      id: 'bld-release-dock',
      name: 'Cloud Release Dock (Deployment & CI/CD)',
      signName: 'RELEASE DOCK',
      department: 'Containerization, Deploy & Infrastructure',
      zone: 'INDUSTRIAL',
      type: 'WAREHOUSE',
      x: 28,
      z: 28,
      width: 11,
      depth: 10,
      height: 20,
      floors: 5,
      roofStyle: 'FLAT',
      facadeColor: '#164E63',
      color: '#164E63',
      roofColor: '#083344',
      accentColor: '#22D3EE',
      residents: 0,
      maxResidents: 0,
      workers: 120,
      maxWorkers: 170,
      powerDemand: 40,
      powerSupplied: true,
      waterDemand: 340,
      waterSupplied: true,
      wasteAccumulated: 14,
      health: 100
    });

    // Landmark 10: Civic Medical Center (Doctor HQ)
    this.buildings.push({
      id: 'bld-hospital',
      name: 'Civic Medical Trauma Center',
      signName: 'CIVIC HOSPITAL',
      department: 'Emergency & Surgical Care',
      zone: 'PUBLIC',
      type: 'HOSPITAL',
      x: -28,
      z: 56,
      width: 12,
      depth: 12,
      height: 18,
      floors: 5,
      roofStyle: 'HELIPAD',
      facadeColor: '#F8FAFC',
      color: '#F8FAFC',
      roofColor: '#E2E8F0',
      accentColor: '#EF4444',
      residents: 0,
      maxResidents: 0,
      workers: 95,
      maxWorkers: 160,
      powerDemand: 38,
      powerSupplied: true,
      waterDemand: 410,
      waterSupplied: true,
      wasteAccumulated: 5,
      underConstruction: false,
      health: 100
    });

    // Add surrounding residential, commercial, and suburban housing blocks
    let bCount = 11;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const bx = (c + 0.5) * spacing - offset;
        const bz = (r + 0.5) * spacing - offset;

        const isNearLandmark = this.buildings.some(b => 
          Math.abs(b.x - bx) < 14 && Math.abs(b.z - bz) < 14
        );
        if (isNearLandmark) continue;

        const isSuburban = (r <= 1 && c <= 1);
        const bType: BuildingType = isSuburban ? 'HOUSE' : 'APARTMENT';
        const height = isSuburban ? 4.5 : (10 + (bCount % 8) * 2);

        this.buildings.push({
          id: `bld-block-${bCount}`,
          name: isSuburban ? `Suburban House #${bCount}` : `Urban Apartment Complex #${bCount}`,
          zone: isSuburban ? 'RESIDENTIAL' : 'COMMERCIAL',
          type: bType,
          x: bx,
          z: bz,
          width: isSuburban ? 7.5 : 8.5,
          depth: isSuburban ? 7.5 : 8.5,
          height,
          floors: isSuburban ? 2 : Math.floor(height / 3),
          roofStyle: isSuburban ? 'PITCHED' : 'FLAT',
          facadeColor: isSuburban ? '#059669' : '#2563EB',
          color: isSuburban ? '#059669' : '#2563EB',
          roofColor: '#78350F',
          accentColor: '#93C5FD',
          residents: isSuburban ? 8 : 65,
          maxResidents: isSuburban ? 12 : 90,
          workers: isSuburban ? 0 : 50,
          maxWorkers: isSuburban ? 0 : 75,
          powerDemand: 10 + height * 1.5,
          powerSupplied: true,
          waterDemand: 100 + height * 12,
          waterSupplied: true,
          wasteAccumulated: (bCount * 7) % 35,
          health: 100
        });
        bCount++;
      }
    }

    // Populate Vehicles
    for (let v = 0; v < 36; v++) {
      const road = this.roads[v % this.roads.length];
      const isEmergency = v === 0 || v === 1;
      this.vehicles.push({
        id: `veh-${v + 1}`,
        type: isEmergency ? (v === 0 ? 'FIRE_TRUCK' : 'AMBULANCE') : (v % 4 === 0 ? 'BUS' : 'CAR'),
        x: road.start[0],
        z: road.start[1],
        y: 0.35,
        angle: 0,
        speed: isEmergency ? 52 : (v % 4 === 0 ? 30 : 38),
        maxSpeed: isEmergency ? 58 : 45,
        color: isEmergency ? '#EF4444' : (v % 4 === 0 ? '#F59E0B' : '#38BDF8'),
        roadId: road.id,
        progress: (v * 0.16) % 0.95,
        laneOffset: (v % 2 === 0 ? 1.3 : -1.3),
        isEmergency,
        sirenActive: false,
        originName: road.name,
        destinationName: 'Central Innovation Plaza'
      });
    }

    // Populate Pedestrians
    for (let p = 0; p < 36; p++) {
      const road = this.roads[p % this.roads.length];
      const prog = (p * 0.1) % 1.0;
      const side = (p % 2 === 0 ? 2.6 : -2.6);
      this.pedestrians.push({
        id: `ped-${p + 1}`,
        x: road.start[0] + (road.end[0] - road.start[0]) * prog,
        z: road.start[1] + (road.end[1] - road.start[1]) * prog + side,
        targetX: road.end[0],
        targetZ: road.end[1] + side,
        speed: 2.2,
        angle: 0,
        color: '#94A3B8',
        state: 'WALKING'
      });
    }
  }

  // --- Initialize The 10 Specialized AI Citizens with Human Personas & AI Models ---
  private initAIAgentCharacters(): void {
    this.agentCharacters = [
      {
        id: 'agent-coordinator',
        role: 'COORDINATOR',
        name: 'Alex Vance',
        title: 'Master Orchestrator',
        profession: 'Chief Systems Architect & Orchestrator',
        department: 'Executive Master Orchestration (Citadel Spire)',
        color: '#38BDF8',
        aiModel: 'OpenAI o1 / o3 High-Reasoning',
        aiProvider: 'OpenAI',
        aiModelBadgeColor: '#10A37F',
        clothingStyle: 'EXECUTIVE',
        skinColor: '#E0AC69',
        hairColor: '#2D251E',
        x: 2.2,
        z: 8.5,
        targetX: 2.2,
        targetZ: 8.5,
        speed: 3.5,
        angle: 0,
        homeBuildingId: 'bld-citadel',
        currentBuildingId: 'bld-citadel',
        currentTask: 'Supervising city-wide autonomous workflows and dependency graphs',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-1', title: 'Initialize Multi-Agent DAG State Machine', completedAt: '09:00 AM', deliverable: 'State machine verified with zero cycles.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Monitoring multi-agent pipeline and scheduling availability.',
        thoughtBubble: 'City operational at 100% capacity.',
        speechTimer: 5.0,
        avatarIcon: 'Cpu',
        level: 10,
        skills: ['Task Decomposition', 'DAG Scheduling', 'Resource Allocation', 'Deadlock Resolution'],
        toolsInUse: ['ProcessRunner', 'TaskStateMachine', 'EventDispatcher'],
        collaboratorIds: ['agent-architect', 'agent-analyst'],
        chatHistory: [
          {
            id: 'init-coord',
            sender: 'AGENT',
            senderName: 'Alex Vance',
            text: 'Greetings Commander! Alex Vance, Chief Architect, powered by OpenAI o1 reasoning engine. All autonomous city workflows are operational. Press [F] to issue an immediate work order or ask me anything!',
            timestamp: '09:00 AM'
          }
        ]
      },
      {
        id: 'agent-analyst',
        role: 'URBAN_PLANNER',
        name: 'Dr. Maya Lin',
        title: 'Product Vision Analyst',
        profession: 'Requirements Engineer & Product Analyst',
        department: 'Requirements & PRD Lab (Vision Lab)',
        color: '#C084FC',
        aiModel: 'Claude 3.5 Sonnet',
        aiProvider: 'Anthropic',
        aiModelBadgeColor: '#D97706',
        clothingStyle: 'SCIENTIST',
        skinColor: '#F5D0C5',
        hairColor: '#1A1A1A',
        x: -2.4,
        z: 7.8,
        targetX: -2.4,
        targetZ: 7.8,
        speed: 3.2,
        angle: Math.PI / 4,
        homeBuildingId: 'bld-vision-lab',
        currentBuildingId: 'bld-vision-lab',
        currentTask: 'Synthesizing verifiable acceptance criteria and user specifications',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-2', title: 'Draft Architectural PRD for City REST API', completedAt: '09:15 AM', deliverable: 'PRD v1.2 with 12 acceptance criteria.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Ready to evaluate user directives and draft project requirements.',
        thoughtBubble: 'Standing by for project briefs...',
        speechTimer: 4.5,
        avatarIcon: 'Layers',
        level: 9,
        skills: ['PRD Formulation', 'Contract Verification', 'User Stories', 'Acceptance Testing'],
        toolsInUse: ['SpecSynthesizer', 'AcceptanceCriteriaGenerator'],
        collaboratorIds: ['agent-coordinator', 'agent-architect'],
        chatHistory: [
          {
            id: 'init-analyst',
            sender: 'AGENT',
            senderName: 'Dr. Maya Lin',
            text: 'Hello Commander. Dr. Maya Lin here, powered by Claude 3.5 Sonnet. I specialize in deep technical reasoning, PRD formulation, and system acceptance criteria.',
            timestamp: '09:05 AM'
          }
        ]
      },
      {
        id: 'agent-architect',
        role: 'TRAFFIC',
        name: 'Marcus Vance',
        title: 'Principal Software Architect',
        profession: 'Domain Architect & Civil Modeler',
        department: 'System Architecture (Blueprint Complex)',
        color: '#3B82F6',
        aiModel: 'DeepSeek R1 Reasoning',
        aiProvider: 'DeepSeek',
        aiModelBadgeColor: '#0284C7',
        clothingStyle: 'ARCHITECT',
        skinColor: '#C68642',
        hairColor: '#3E2723',
        x: 3.5,
        z: 13.5,
        targetX: 3.5,
        targetZ: 13.5,
        speed: 3.4,
        angle: -Math.PI / 4,
        homeBuildingId: 'bld-blueprint',
        currentBuildingId: 'bld-blueprint',
        currentTask: 'Designing domain interfaces and database schemas',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-3', title: 'Normalize SQLite Schema and Foreign Keys', completedAt: '09:20 AM', deliverable: 'Schema DDL validated.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Domain models structured; interfaces decoupled from outer services.',
        thoughtBubble: 'Architecture contracts ready.',
        speechTimer: 6.0,
        avatarIcon: 'Compass',
        level: 10,
        skills: ['Clean Architecture', 'Type Hints', 'Schema Normalization', 'Structural Engineering'],
        toolsInUse: ['SchemaArchitect', 'InterfaceContractValidator'],
        collaboratorIds: ['agent-engineer', 'agent-analyst'],
        chatHistory: [
          {
            id: 'init-arch',
            sender: 'AGENT',
            senderName: 'Marcus Vance',
            text: 'Marcus Vance ready for structural modeling, powered by DeepSeek R1. I verify mathematical structural proofs and clean architecture contracts.',
            timestamp: '09:10 AM'
          }
        ]
      },
      {
        id: 'agent-engineer',
        role: 'ENERGY',
        name: 'Devon Cross',
        title: 'Senior Implementation Engineer',
        profession: 'Full-Stack Software Engineer',
        department: 'Source Code Fabrication (Foundry)',
        color: '#F59E0B',
        aiModel: 'Qwen 2.5 Coder 32B',
        aiProvider: 'Alibaba Cloud',
        aiModelBadgeColor: '#F59E0B',
        clothingStyle: 'ENGINEER',
        skinColor: '#E5A65E',
        hairColor: '#4A3525',
        x: -3.2,
        z: 12.8,
        targetX: -3.2,
        targetZ: 12.8,
        speed: 3.6,
        angle: Math.PI * 0.75,
        homeBuildingId: 'bld-foundry',
        currentBuildingId: 'bld-foundry',
        currentTask: 'Synthesizing robust FastAPI route handlers and business logic',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-4', title: 'Implement Auth Token Validation Endpoint', completedAt: '09:25 AM', deliverable: 'api_service.py controller compiled.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Ready to write type-safe code without silent failures.',
        thoughtBubble: 'Awaiting coding directive...',
        speechTimer: 5.5,
        avatarIcon: 'Sliders',
        level: 9,
        skills: ['Python 3.13 / FastAPI', 'TypeScript / React', 'AsyncIO Concurrency', 'SQLAlchemy / SQLite'],
        toolsInUse: ['CodeFabricator', 'ASTRefactoringEngine'],
        collaboratorIds: ['agent-architect', 'agent-qa'],
        chatHistory: [
          {
            id: 'init-eng',
            sender: 'AGENT',
            senderName: 'Devon Cross',
            text: 'Devon Cross on standby! Powered by Qwen 2.5 Coder. High-speed code fabrication, async logic, and AST transformations are ready to compile.',
            timestamp: '09:15 AM'
          }
        ]
      },
      {
        id: 'agent-qa',
        role: 'WATER_WASTE',
        name: 'Elena Rostova',
        title: 'QA Bastion Test Lead',
        profession: 'Automated Test Engineer & Verifier',
        department: 'Quality Assurance & Automated Verification (QA Bastion)',
        color: '#10B981',
        aiModel: 'GPT-4o Omnimodal',
        aiProvider: 'OpenAI',
        aiModelBadgeColor: '#10A37F',
        clothingStyle: 'QA',
        skinColor: '#F8D9D6',
        hairColor: '#8B0000',
        x: -1.5,
        z: 16.5,
        targetX: -1.5,
        targetZ: 16.5,
        speed: 3.3,
        angle: -Math.PI * 0.75,
        homeBuildingId: 'bld-qa-bastion',
        currentBuildingId: 'bld-qa-bastion',
        currentTask: 'Executing 20/20 pytest regression suites with edge-case assertion validation',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-5', title: 'Verify 20/20 Test Suite on Backend API', completedAt: '09:30 AM', deliverable: '100% test assertions passed.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'All test assertions verified. Zero regressions in active sandbox.',
        thoughtBubble: '20/20 tests PASSED.',
        speechTimer: 6.5,
        avatarIcon: 'ShieldCheck',
        level: 10,
        skills: ['Pytest Automation', 'Coverage Profiling', 'Mutation Testing', 'Regression Verification'],
        toolsInUse: ['PytestVerifier', 'CoverageProfiler'],
        collaboratorIds: ['agent-engineer', 'agent-diagnostic'],
        chatHistory: [
          {
            id: 'init-qa',
            sender: 'AGENT',
            senderName: 'Elena Rostova',
            text: 'Elena Rostova standing by, powered by GPT-4o. I run rigorous pytest and integration test suites. 20/20 test assertions currently verified.',
            timestamp: '09:20 AM'
          }
        ]
      },
      {
        id: 'agent-diagnostic',
        role: 'ECONOMY',
        name: 'Dr. Aaron Chen',
        title: 'Diagnostic Specialist',
        profession: 'Root Cause & Troubleshooting Specialist',
        department: 'Diagnostic Core & Troubleshooting',
        color: '#EC4899',
        aiModel: 'Gemini 2.0 Flash Thinking',
        aiProvider: 'Google DeepMind',
        aiModelBadgeColor: '#4285F4',
        clothingStyle: 'DIAGNOSTIC',
        skinColor: '#ECC0A0',
        hairColor: '#0F0F0F',
        x: 2.8,
        z: 5.5,
        targetX: 2.8,
        targetZ: 5.5,
        speed: 3.4,
        angle: Math.PI,
        homeBuildingId: 'bld-diagnostic',
        currentBuildingId: 'bld-diagnostic',
        currentTask: 'Performing automated root cause analysis on execution traces',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-6', title: 'Analyze Canvas 2D roundRect Compatibility', completedAt: '09:35 AM', deliverable: 'Applied safe polyfill across browsers.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Telemetry diagnostics clean; zero unhandled exceptions.',
        thoughtBubble: 'Diagnostics clean.',
        speechTimer: 4.0,
        avatarIcon: 'Radio',
        level: 9,
        skills: ['Traceback Deconstruction', 'Memory Profiling', 'Heuristic Repair', 'Log Inspection'],
        toolsInUse: ['TracebackAnalyzer', 'AutomatedPatchGenerator'],
        collaboratorIds: ['agent-qa', 'agent-engineer'],
        chatHistory: [
          {
            id: 'init-diag',
            sender: 'AGENT',
            senderName: 'Dr. Aaron Chen',
            text: 'Dr. Chen here, powered by Gemini 2.0 Flash. Real-time telemetry, exception tracing, and automated heuristic repair operational.',
            timestamp: '09:25 AM'
          }
        ]
      },
      {
        id: 'agent-security',
        role: 'PUBLIC_SAFETY',
        name: 'Kaelen Voss',
        title: 'Security Sentinel',
        profession: 'Security Engineer & Policy Auditor',
        department: 'Security Citadel & Policy Guardrails',
        color: '#EF4444',
        aiModel: 'Llama 3.1 70B Instruct',
        aiProvider: 'Meta AI',
        aiModelBadgeColor: '#0668E1',
        clothingStyle: 'SECURITY',
        skinColor: '#D29E74',
        hairColor: '#212121',
        x: -4.5,
        z: 9.8,
        targetX: -4.5,
        targetZ: 9.8,
        speed: 3.5,
        angle: Math.PI / 2,
        homeBuildingId: 'bld-security',
        currentBuildingId: 'bld-security',
        currentTask: 'Enforcing workspace path-jail containment and secret sanitization',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-7', title: 'Audit Host Command Whitelist & Path Containment', completedAt: '09:40 AM', deliverable: 'Sandbox perimeter 100% contained.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Security guardrails active. Unauthorized filesystem access blocked.',
        thoughtBubble: 'Security: 100% SECURE',
        speechTimer: 7.0,
        avatarIcon: 'Flame',
        level: 10,
        skills: ['Path Traversal Jail', 'Command Whitelisting', 'Secret Redaction', 'OWASP Vulnerability Audit'],
        toolsInUse: ['PathJailVerifier', 'SecretRedactionEngine'],
        collaboratorIds: ['agent-coordinator', 'agent-devops'],
        chatHistory: [
          {
            id: 'init-sec',
            sender: 'AGENT',
            senderName: 'Kaelen Voss',
            text: 'Security Sentinel Voss active, powered by Llama 3.1 70B. Workspace jail boundaries, secret filtering, and command whitelist policies are strictly enforced.',
            timestamp: '09:30 AM'
          }
        ]
      },
      {
        id: 'agent-devops',
        role: 'WELFARE',
        name: 'Sora Takahashi',
        title: 'Cloud Release Dock Chief',
        profession: 'DevOps & Cloud Infrastructure Engineer',
        department: 'Deployment & CI/CD Pipeline (Release Dock)',
        color: '#06B6D4',
        aiModel: 'Claude 3 Opus',
        aiProvider: 'Anthropic',
        aiModelBadgeColor: '#D97706',
        clothingStyle: 'DEVOPS',
        skinColor: '#F3CFB6',
        hairColor: '#1F2937',
        x: 4.8,
        z: 10.5,
        targetX: 4.8,
        targetZ: 10.5,
        speed: 3.3,
        angle: Math.PI / 4,
        homeBuildingId: 'bld-release-dock',
        currentBuildingId: 'bld-release-dock',
        currentTask: 'Preparing production Docker assets and GitHub Actions CI pipelines',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-8', title: 'Generate Dockerfile & OCI Container Spec', completedAt: '09:45 AM', deliverable: 'Multi-stage Dockerfile verified.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Container manifests verified; ready to deploy release artifacts.',
        thoughtBubble: 'CI/CD pipeline ready.',
        speechTimer: 5.0,
        avatarIcon: 'Zap',
        level: 9,
        skills: ['Docker OCI Containers', 'CI/CD Pipelines', 'Cloud Run Provisioning', 'Health Monitoring'],
        toolsInUse: ['DockerBuilder', 'ArtifactPackager'],
        collaboratorIds: ['agent-security', 'agent-engineer'],
        chatHistory: [
          {
            id: 'init-devops',
            sender: 'AGENT',
            senderName: 'Sora Takahashi',
            text: 'Sora Takahashi here, powered by Claude 3 Opus! Managing Docker builds, CI/CD runners, and deployment staging. Standing by for instructions.',
            timestamp: '09:35 AM'
          }
        ]
      },
      {
        id: 'agent-constructor',
        role: 'URBAN_PLANNER',
        name: 'Harlan Drake',
        title: 'Civil Construction Lead',
        profession: 'Civil Infrastructure & Construction Engineer',
        department: 'Civic Development & Construction Operations',
        color: '#EAB308',
        aiModel: 'Mistral Large 2',
        aiProvider: 'Mistral AI',
        aiModelBadgeColor: '#F97316',
        clothingStyle: 'CONSTRUCTION',
        skinColor: '#C08A58',
        hairColor: '#4B3621',
        x: -4.2,
        z: 15.0,
        targetX: -4.2,
        targetZ: 15.0,
        speed: 3.1,
        angle: 0,
        homeBuildingId: 'bld-hospital',
        currentBuildingId: 'bld-hospital',
        currentTask: 'Managing structural engineering and building site progress',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-9', title: 'Foundation Survey for Civic Trauma Center', completedAt: '09:50 AM', deliverable: 'Site structural integrity certified.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Construction sites surveyed. Heavy machinery standing by.',
        thoughtBubble: 'Cranes and scaffolding ready.',
        speechTimer: 5.0,
        avatarIcon: 'Building2',
        level: 9,
        skills: ['Structural Construction', 'Material Sourcing', 'Site Safety', 'Heavy Machinery Operation'],
        toolsInUse: ['StructuralEstimator', 'SiteProgressTracker'],
        collaboratorIds: ['agent-architect', 'agent-devops'],
        chatHistory: [
          {
            id: 'init-con',
            sender: 'AGENT',
            senderName: 'Harlan Drake',
            text: 'Harlan Drake on site, powered by Mistral Large! High-visibility vest on, hard hat ready. Press [F] to command construction and structural repairs.',
            timestamp: '09:40 AM'
          }
        ]
      },
      {
        id: 'agent-doctor',
        role: 'PUBLIC_SAFETY',
        name: 'Dr. Sarah Miller',
        title: 'Chief Medical Director',
        profession: 'Emergency Medicine & Healthcare Operations',
        department: 'Civic Medical Center (Hospital)',
        color: '#F43F5E',
        aiModel: 'Gemini 1.5 Pro',
        aiProvider: 'Google DeepMind',
        aiModelBadgeColor: '#4285F4',
        clothingStyle: 'DOCTOR',
        skinColor: '#F7D5C8',
        hairColor: '#B5814C',
        x: 1.5,
        z: 17.0,
        targetX: 1.5,
        targetZ: 17.0,
        speed: 3.2,
        angle: -Math.PI / 2,
        homeBuildingId: 'bld-hospital',
        currentBuildingId: 'bld-hospital',
        currentTask: 'Supervising emergency medical response and hospital operations',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-10', title: 'Equip Trauma Center Medical Oxygen Grid', completedAt: '09:55 AM', deliverable: 'Medical oxygen infrastructure verified.' }
        ],
        workProgress: 100,
        availability: 'AVAILABLE',
        status: 'IDLE',
        currentThought: 'Medical wards operating at nominal readiness. Ambulances equipped.',
        thoughtBubble: 'Emergency medical ready.',
        speechTimer: 5.5,
        avatarIcon: 'Heart',
        level: 10,
        skills: ['Emergency Medicine', 'Triage Protocol', 'Hospital Operations', 'Biohazard Containment'],
        toolsInUse: ['MedicalTelemetry', 'TriageDispatcher'],
        collaboratorIds: ['agent-security', 'agent-coordinator'],
        chatHistory: [
          {
            id: 'init-doc',
            sender: 'AGENT',
            senderName: 'Dr. Sarah Miller',
            text: 'Greetings Commander. Dr. Sarah Miller, Chief Medical Director, powered by Gemini 1.5 Pro. White coat on, bio-telemetry online. Citizen health index at 98%.',
            timestamp: '09:45 AM'
          }
        ]
      }
    ];
  }

  // --- Default Public Missions ---
  private initDefaultPublicMissions(): void {
    this.publicMissions = [
      {
        id: 'mission-hospital',
        title: 'Construct Modern Medical Trauma Center in Civic District',
        description: 'Design, build, wire, and commission a high-capacity civic medical facility with emergency wards and ICU beds.',
        category: 'CONSTRUCTION',
        status: 'IN_PROGRESS',
        progress: 35,
        targetBuildingId: 'bld-hospital',
        acceptanceCriteria: [
          'Architectural schematics approved',
          'Foundation and structural steel erected',
          'Power grid & water lines connected',
          'Medical safety inspection passed'
        ],
        deliverables: [
          'hospital_architectural_blueprint.cad',
          'structural_safety_certificate.pdf'
        ],
        blockers: [],
        publishedAt: '09:00 AM',
        participatingAgentIds: ['agent-architect', 'agent-constructor', 'agent-devops', 'agent-doctor', 'agent-security'],
        subtasks: [
          {
            id: 'task-hosp-1',
            title: 'Design Hospital Architectural Blueprint',
            description: 'Draft structural layouts and emergency access points.',
            expectedDeliverable: 'hospital_blueprints_v2.pdf',
            priority: 'HIGH',
            status: 'COMPLETED',
            progress: 100,
            assignedAgentId: 'agent-architect',
            assignedAgentName: 'Marcus Vance',
            source: 'PUBLIC_MISSION',
            publicMissionId: 'mission-hospital',
            requiredSkills: ['Structural Engineering'],
            dependencies: [],
            deliverableResult: 'Architectural schematics finalized and validated.',
            createdAt: '09:00 AM',
            completedAt: '09:15 AM'
          },
          {
            id: 'task-hosp-2',
            title: 'Erect Foundation & Structural Framework',
            description: 'Coordinate cranes and steel girder construction on site.',
            expectedDeliverable: 'foundation_structural_mesh',
            priority: 'HIGH',
            status: 'WORKING',
            progress: 45,
            assignedAgentId: 'agent-constructor',
            assignedAgentName: 'Harlan Drake',
            source: 'PUBLIC_MISSION',
            publicMissionId: 'mission-hospital',
            requiredSkills: ['Structural Construction'],
            dependencies: ['task-hosp-1'],
            createdAt: '09:15 AM'
          },
          {
            id: 'task-hosp-3',
            title: 'Install High-Voltage Medical Power Grid',
            description: 'Connect primary and auxiliary battery reserves to hospital ICU.',
            expectedDeliverable: 'power_connection_receipt',
            priority: 'MEDIUM',
            status: 'PENDING',
            progress: 0,
            assignedAgentId: 'agent-devops',
            assignedAgentName: 'Sora Takahashi',
            source: 'PUBLIC_MISSION',
            publicMissionId: 'mission-hospital',
            requiredSkills: ['Cloud Run Provisioning'],
            dependencies: ['task-hosp-2'],
            createdAt: '09:15 AM'
          },
          {
            id: 'task-hosp-4',
            title: 'Commission Intensive Care Unit Equipment',
            description: 'Verify bio-monitors, medical gas pressure, and triage ward readiness.',
            expectedDeliverable: 'icu_readiness_report.json',
            priority: 'HIGH',
            status: 'PENDING',
            progress: 0,
            assignedAgentId: 'agent-doctor',
            assignedAgentName: 'Dr. Sarah Miller',
            source: 'PUBLIC_MISSION',
            publicMissionId: 'mission-hospital',
            requiredSkills: ['Hospital Operations'],
            dependencies: ['task-hosp-3'],
            createdAt: '09:15 AM'
          }
        ]
      }
    ];

    this.activeMissionId = 'mission-hospital';
  }

  // --- Authoritative Simulation Tick Loop ---
  public tick(deltaSeconds: number): void {
    if (this.simulationSpeed <= 0) return;
    const effectiveDelta = Math.min(deltaSeconds, 0.1) * this.simulationSpeed;
    this.tickCount++;

    // Advance 24-hour simulation clock
    this.simulationTime = (this.simulationTime + (effectiveDelta * 0.04)) % 24.0;

    // 1. Proximity Detection: Player <-> AI Citizens
    let closestDist = 999;
    let closestId: string | null = null;
    this.agentCharacters.forEach(ag => {
      const dist = Math.sqrt((this.player.x - ag.x) ** 2 + (this.player.z - ag.z) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = ag.id;
      }
    });

    if (closestDist <= 3.6) {
      this.player.nearbyAgentId = closestId;
      this.player.nearbyAgentDistance = closestDist;
    } else {
      this.player.nearbyAgentId = null;
      this.player.nearbyAgentDistance = closestDist;
    }

    // 2. Traffic Light Signals
    this.intersections.forEach(inter => {
      inter.timer += effectiveDelta;
      if (inter.timer >= inter.greenDuration) {
        inter.timer = 0;
        inter.signalState = inter.signalState === 'NS_GREEN' ? 'EW_GREEN' : 'NS_GREEN';
      }
    });

    // 3. Move Vehicles along road network
    this.vehicles.forEach(veh => {
      const road = this.roads.find(r => r.id === veh.roadId);
      if (!road) return;

      const step = (veh.speed * 0.035 * effectiveDelta);
      veh.progress = Math.min(1.0, veh.progress + step);

      const sx = road.start[0];
      const sz = road.start[1];
      const ex = road.end[0];
      const ez = road.end[1];
      const dx = ex - sx;
      const dz = ez - sz;
      const roadLength = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = -dz / roadLength;
      const nz = dx / roadLength;

      veh.x = sx + dx * veh.progress + (nx * veh.laneOffset);
      veh.z = sz + dz * veh.progress + (nz * veh.laneOffset);
      veh.angle = Math.atan2(dz, dx);

      if (veh.progress >= 0.99) {
        veh.progress = 0.01;
        const candidates = this.roads.filter(r => 
          !r.isClosed && r.id !== road.id &&
          ((Math.abs(r.start[0] - ex) < 1.0 && Math.abs(r.start[1] - ez) < 1.0) ||
           (Math.abs(r.end[0] - ex) < 1.0 && Math.abs(r.end[1] - ez) < 1.0))
        );
        if (candidates.length > 0) {
          veh.roadId = candidates[Math.floor(Math.random() * candidates.length)].id;
        } else {
          veh.laneOffset = -veh.laneOffset;
          veh.progress = 0.05;
        }
      }
    });

    // 4. Update AI Agent Behavioral State Machine & Work Lifecycle
    this.agentCharacters.forEach(ag => {
      // Countdown speech timer
      if (ag.speechTimer !== undefined) {
        ag.speechTimer -= effectiveDelta;
        if (ag.speechTimer <= 0) {
          ag.thoughtBubble = undefined;
        }
      }

      // Check distance to current target destination
      const dx = ag.targetX - ag.x;
      const dz = ag.targetZ - ag.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.8) {
        // Traveling to assigned workplace or destination
        const step = ag.speed * effectiveDelta;
        ag.x += (dx / dist) * step;
        ag.z += (dz / dist) * step;
        ag.angle = Math.atan2(dz, dx);
        if (ag.status !== 'WORKING' && ag.status !== 'VERIFYING') {
          ag.status = 'TRAVELING';
        }
      } else {
        // At target destination
        if (ag.status === 'TRAVELING') {
          ag.status = ag.activeTask ? 'WORKING' : 'IDLE';
        }
      }

      // Active Task Progress Lifecycle
      if (ag.activeTask && ag.activeTask.status !== 'COMPLETED' && ag.activeTask.status !== 'BLOCKED') {
        ag.status = 'WORKING';
        ag.availability = 'BUSY';
        ag.workProgress = Math.min(100, ag.workProgress + effectiveDelta * 4.5);
        ag.activeTask.progress = Math.round(ag.workProgress);

        if (ag.workProgress >= 85 && ag.activeTask.status !== 'VERIFYING') {
          ag.activeTask.status = 'VERIFYING';
          ag.status = 'VERIFYING';
          ag.thoughtBubble = `Verifying ${ag.activeTask.title.slice(0, 24)}...`;
          ag.speechTimer = 4.0;
        }

        if (ag.workProgress >= 100) {
          // Task Completed!
          ag.activeTask.status = 'COMPLETED';
          ag.activeTask.completedAt = new Date().toLocaleTimeString();
          ag.activeTask.deliverableResult = `Verified deliverable: ${ag.activeTask.expectedDeliverable} generated by ${ag.name}`;
          
          ag.taskHistory.unshift({
            id: ag.activeTask.id,
            title: ag.activeTask.title,
            completedAt: ag.activeTask.completedAt,
            deliverable: ag.activeTask.deliverableResult
          });

          ag.thoughtBubble = `Task Complete: ${ag.activeTask.title.slice(0, 26)}!`;
          ag.speechTimer = 6.0;

          // If linked to a Public Mission, update public mission DAG
          if (ag.activeTask.publicMissionId) {
            this.handleSubtaskCompleted(ag.activeTask.publicMissionId, ag.activeTask.id);
          }

          // Pick next queued task or go idle
          if (ag.taskQueue.length > 0) {
            ag.activeTask = ag.taskQueue.shift() || null;
            ag.workProgress = 0;
            ag.status = 'ASSIGNED';
          } else {
            ag.activeTask = null;
            ag.status = 'IDLE';
            ag.availability = 'AVAILABLE';
            ag.currentTask = 'Standing by for new task directives';
          }
        }
      } else if (!ag.activeTask && Math.random() < 0.003) {
        // Autonomous stroll between departments and Innovation Plaza
        const destinations = [
          { x: 0, z: 0 },
          { x: 0, z: -24 },
          { x: 24, z: 0 },
          { x: 24, z: -24 },
          { x: -24, z: 24 },
          { x: -24, z: -24 },
          { x: -24, z: 0 },
          { x: 0, z: 24 },
          { x: 24, z: 24 },
          { x: -24, z: 52 }
        ];
        const dest = destinations[Math.floor(Math.random() * destinations.length)];
        ag.targetX = dest.x + (Math.random() * 4 - 2);
        ag.targetZ = dest.z + (Math.random() * 4 - 2);
      }
    });

    this.recalculateMetrics();

    // Auto-save every 10 seconds
    if (this.tickCount % 60 === 0) {
      this.saveToStorage();
    }
  }

  // --- Assign Direct Individual Task to an Agent ---
  public assignIndividualTask(
    agentId: string, 
    taskData: { title: string; description: string; expectedDeliverable: string; priority: AgentTask['priority'] }
  ): { success: boolean; message: string; task?: AgentTask } {
    const ag = this.agentCharacters.find(a => a.id === agentId);
    if (!ag) return { success: false, message: 'Agent not found.' };

    const task: AgentTask = {
      id: `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: taskData.title,
      description: taskData.description,
      expectedDeliverable: taskData.expectedDeliverable,
      priority: taskData.priority,
      status: 'ASSIGNED',
      progress: 0,
      assignedAgentId: ag.id,
      assignedAgentName: ag.name,
      source: 'INDIVIDUAL',
      requiredSkills: [ag.skills[0] || 'General'],
      dependencies: [],
      createdAt: new Date().toLocaleTimeString()
    };

    if (ag.activeTask) {
      ag.taskQueue.push(task);
      ag.thoughtBubble = `Task queued: "${task.title.slice(0, 24)}..."`;
      ag.speechTimer = 5.0;
      return { success: true, message: `Task queued behind ${ag.activeTask.title}.`, task };
    } else {
      ag.activeTask = task;
      ag.currentTask = task.title;
      ag.workProgress = 0;
      ag.status = 'ASSIGNED';
      ag.availability = 'BUSY';
      ag.thoughtBubble = `Directive received: "${task.title.slice(0, 24)}..."`;
      ag.speechTimer = 6.0;

      // Head to home department
      const home = this.buildings.find(b => b.id === ag.homeBuildingId);
      if (home) {
        ag.targetX = home.x;
        ag.targetZ = home.z;
      }
      return { success: true, message: `Direct task assigned to ${ag.name}.`, task };
    }
  }

  // --- Direct Work Command (Triggered by [F] Key or Interface to Make Them Work) ---
  public directWorkCommand(agentId: string): { success: boolean; message: string; task: AgentTask } {
    const ag = this.agentCharacters.find(a => a.id === agentId);
    if (!ag) {
      const fallbackTask: AgentTask = {
        id: `task-err-${Date.now()}`,
        title: 'Unknown Directive',
        description: '',
        expectedDeliverable: '',
        priority: 'MEDIUM',
        status: 'ASSIGNED',
        progress: 0,
        assignedAgentId: agentId,
        assignedAgentName: 'Unknown',
        source: 'INDIVIDUAL',
        requiredSkills: [],
        dependencies: [],
        createdAt: new Date().toLocaleTimeString()
      };
      return { success: false, message: 'Agent not found.', task: fallbackTask };
    }

    // If agent is already working, expedite progress!
    if (ag.activeTask && (ag.status === 'WORKING' || ag.status === 'ASSIGNED')) {
      ag.workProgress = Math.min(100, ag.workProgress + 25);
      ag.thoughtBubble = `⚡ [F] Expedited! Progress: ${ag.workProgress.toFixed(0)}%`;
      ag.speechTimer = 6.0;
      this.saveToStorage();
      return { 
        success: true, 
        message: `Expedited work order on ${ag.name}! Task progress boosted to ${ag.workProgress.toFixed(0)}%.`, 
        task: ag.activeTask 
      };
    }

    // Determine domain-specific task template tailored to citizen's profession
    let taskTitle = `${ag.profession} Priority Operation`;
    let taskDesc = `High-priority autonomous task executed by ${ag.name} at the direct instruction of the Commander.`;
    let taskDeliverable = `${ag.name.toLowerCase().replace(/\s+/g, '_')}_deliverable.artifact`;

    if (ag.id === 'agent-coordinator') {
      taskTitle = 'Optimize Autonomous Multi-Agent DAG Execution Matrix';
      taskDesc = 'Analyze active agent workloads, resolve resource contention, and maximize pipeline throughput.';
      taskDeliverable = 'dag_execution_matrix_optimized.json';
    } else if (ag.id === 'agent-analyst') {
      taskTitle = 'Synthesize Architectural Acceptance Criteria & System PRD';
      taskDesc = 'Formulate formal acceptance contracts, user journey invariants, and edge-case test matrices.';
      taskDeliverable = 'system_acceptance_criteria_prd.md';
    } else if (ag.id === 'agent-architect') {
      taskTitle = 'Design Resilient Domain Architecture & SQLite DDL Schema';
      taskDesc = 'Normalize entity relationships, decouple domain boundaries, and enforce type safety.';
      taskDeliverable = 'domain_schema_ddl_contracts.py';
    } else if (ag.id === 'agent-engineer') {
      taskTitle = 'Fabricate High-Throughput REST API Controller with SQLite WAL';
      taskDesc = 'Synthesize production-grade FastAPI endpoints with error wrappers and input validation.';
      taskDeliverable = 'api_controller_fastapi_wal.py';
    } else if (ag.id === 'agent-qa') {
      taskTitle = 'Execute 20/20 Pytest Automated Verification Suite & Assertions';
      taskDesc = 'Run comprehensive test matrix across all endpoints, state machines, and security jails.';
      taskDeliverable = 'pytest_20_passed_verification_report.log';
    } else if (ag.id === 'agent-diagnostic') {
      taskTitle = 'Perform Deep Telemetry Diagnostics & Root Cause Analysis';
      taskDesc = 'Scan memory allocations, detect potential event loop bottlenecks, and optimize tick budget.';
      taskDeliverable = 'telemetry_rca_diagnostic_dump.json';
    } else if (ag.id === 'agent-security') {
      taskTitle = 'Conduct Zero-Trust Security Sandbox & Path Jail Audit';
      taskDesc = 'Verify filesystem path containment, sanitize secrets, and enforce command whitelists.';
      taskDeliverable = 'zero_trust_security_audit.sec';
    } else if (ag.id === 'agent-devops') {
      taskTitle = 'Build Multi-Stage Docker OCI Image & GitHub CI Pipeline';
      taskDesc = 'Package optimized application container with non-root security and healthcheck probes.';
      taskDeliverable = 'docker_oci_ci_pipeline_spec.yaml';
    } else if (ag.id === 'agent-constructor') {
      taskTitle = 'Civic Structural Reinforcement & Foundation Stabilization';
      taskDesc = 'Operate heavy construction machinery to reinforce foundation pilings and utility conduits.';
      taskDeliverable = 'civic_foundation_stabilization.spec';
    } else if (ag.id === 'agent-doctor') {
      taskTitle = 'Deploy Mobile Emergency Triage & Bio-Monitoring Protocol';
      taskDesc = 'Calibrate bio-telemetry sensors and prepare trauma bay life support systems.';
      taskDeliverable = 'mobile_triage_biomonitoring_protocol.med';
    }

    const task: AgentTask = {
      id: `task-direct-${Date.now()}`,
      title: taskTitle,
      description: taskDesc,
      expectedDeliverable: taskDeliverable,
      priority: 'CRITICAL',
      status: 'WORKING',
      progress: 25,
      assignedAgentId: ag.id,
      assignedAgentName: ag.name,
      source: 'INDIVIDUAL',
      requiredSkills: ag.skills,
      dependencies: [],
      createdAt: new Date().toLocaleTimeString()
    };

    ag.activeTask = task;
    ag.currentTask = task.title;
    ag.workProgress = 25;
    ag.status = 'WORKING';
    ag.availability = 'BUSY';
    ag.thoughtBubble = `⚡ [F] Direct Work Order: "${task.title.slice(0, 22)}..."`;
    ag.speechTimer = 7.0;

    // Head towards home or site
    const home = this.buildings.find(b => b.id === ag.homeBuildingId);
    if (home) {
      ag.targetX = home.x + (Math.random() * 4 - 2);
      ag.targetZ = home.z + (Math.random() * 4 - 2);
    }

    if (!ag.chatHistory) ag.chatHistory = [];
    ag.chatHistory.push({
      id: `msg-${Date.now()}-cmd`,
      sender: 'AGENT',
      senderName: ag.name,
      text: `⚡ Direct Work Order acknowledged! Commencing "${task.title}". Operational state: WORKING. Deliverable: ${task.expectedDeliverable}.`,
      timestamp: new Date().toLocaleTimeString()
    });

    this.saveToStorage();
    return { 
      success: true, 
      message: `Work Order Dispatched: ${ag.name} is now WORKING on "${task.title}"!`, 
      task 
    };
  }

  // --- 2-Way Conversational Dialogue System ---
  public interactWithAgent(agentId: string, playerMessage: string): AgentChatMessage {
    const ag = this.agentCharacters.find(a => a.id === agentId);
    if (!ag) {
      return {
        id: `err-${Date.now()}`,
        sender: 'AGENT',
        senderName: 'Unknown',
        text: 'Agent not found in city registry.',
        timestamp: new Date().toLocaleTimeString()
      };
    }

    if (!ag.chatHistory) ag.chatHistory = [];

    // 1. Record player message
    const playerMsgObj: AgentChatMessage = {
      id: `pmsg-${Date.now()}`,
      sender: 'PLAYER',
      senderName: 'Commander',
      text: playerMessage,
      timestamp: new Date().toLocaleTimeString()
    };
    ag.chatHistory.push(playerMsgObj);

    // 2. Intelligent NLP / Context Evaluation
    const lower = playerMessage.toLowerCase();
    let replyText = '';

    if (lower.includes('work') || lower.includes('start') || lower.includes('make') || lower.includes('build') || lower.includes('code') || lower.includes('fix') || lower.includes('execute')) {
      const res = this.directWorkCommand(agentId);
      replyText = `Direct work order received, Commander! I have initiated "${res.task.title}". Operational state switched to WORKING. Target deliverable: ${res.task.expectedDeliverable}.`;
    } else if (lower.includes('status') || lower.includes('doing') || lower.includes('progress') || lower.includes('objective')) {
      if (ag.activeTask) {
        replyText = `I am currently executing "${ag.activeTask.title}" (${ag.workProgress.toFixed(0)}% complete). Status: ${ag.status}. Expected deliverable: ${ag.activeTask.expectedDeliverable}. No active blockers.`;
      } else {
        replyText = `I am currently on standby at ${ag.department}. Availability is ${ag.availability}. All toolchains ready. You can press [F] or ask me to start work anytime!`;
      }
    } else if (lower.includes('skill') || lower.includes('tool') || lower.includes('can you') || lower.includes('what do you do')) {
      replyText = `My primary specialization is ${ag.profession}. My core competencies: ${ag.skills.join(', ')}. Active toolchain: ${ag.toolsInUse.join(', ')}.`;
    } else if (lower.includes('team') || lower.includes('collaborator') || lower.includes('who')) {
      replyText = `I actively collaborate with: ${ag.collaboratorIds.join(', ')}. We synchronize task dependencies via the central DAG scheduler.`;
    } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      replyText = `Greetings, Commander! ${ag.name} at your disposal. The city's systems are healthy and operational. How can I assist with your objectives today?`;
    } else if (lower.includes('stop') || lower.includes('pause') || lower.includes('cancel')) {
      if (ag.activeTask) {
        const title = ag.activeTask.title;
        ag.activeTask = null;
        ag.status = 'IDLE';
        ag.availability = 'AVAILABLE';
        ag.currentTask = 'Task halted by Commander';
        replyText = `Understood. Halted work on "${title}". I have returned to standby state.`;
      } else {
        replyText = `I am already on standby with no active task. Ready for new orders.`;
      }
    } else {
      replyText = `Acknowledged, Commander. As ${ag.profession}, I am monitoring this sector. My focus is on ${ag.skills[0] || 'quality operations'}. Press [F] anytime to dispatch me to work on a priority task!`;
    }

    const agentMsgObj: AgentChatMessage = {
      id: `amsg-${Date.now()}`,
      sender: 'AGENT',
      senderName: ag.name,
      text: replyText,
      timestamp: new Date().toLocaleTimeString()
    };
    ag.chatHistory.push(agentMsgObj);

    // Update 3D Thought/Speech Bubble
    ag.thoughtBubble = replyText.length > 50 ? replyText.slice(0, 48) + '...' : replyText;
    ag.speechTimer = 8.0;

    this.saveToStorage();
    return agentMsgObj;
  }

  // --- Publish Public Mission ---
  public publishPublicMission(data: {
    title: string;
    description: string;
    category: PublicMission['category'];
  }): PublicMission {
    const missionId = `mission-${Date.now()}`;
    const mission: PublicMission = {
      id: missionId,
      title: data.title,
      description: data.description,
      category: data.category,
      status: 'IN_PROGRESS',
      progress: 5,
      subtasks: [],
      participatingAgentIds: [],
      blockers: [],
      acceptanceCriteria: [
        'All dependency subtasks executed and validated',
        'Artifacts produced and verified against system invariants'
      ],
      deliverables: [],
      publishedAt: new Date().toLocaleTimeString()
    };

    // Auto-decompose based on category into dependency-aware subtasks
    if (data.category === 'SOFTWARE') {
      mission.subtasks = [
        {
          id: `${missionId}-1`,
          title: 'PRD & API Specification',
          description: 'Define REST endpoints, payload schemas, and acceptance criteria.',
          expectedDeliverable: 'api_spec.yaml',
          priority: 'HIGH',
          status: 'WORKING',
          progress: 10,
          assignedAgentId: 'agent-analyst',
          assignedAgentName: 'Dr. Maya Lin',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['PRD Formulation'],
          dependencies: [],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-2`,
          title: 'Database Schema & Interfaces',
          description: 'Design normalized tables and Pydantic schema contracts.',
          expectedDeliverable: 'schema.py',
          priority: 'HIGH',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-architect',
          assignedAgentName: 'Marcus Vance',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Clean Architecture'],
          dependencies: [`${missionId}-1`],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-3`,
          title: 'FastAPI Controller Implementation',
          description: 'Synthesize route controllers with SQLite persistence.',
          expectedDeliverable: 'main.py',
          priority: 'CRITICAL',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-engineer',
          assignedAgentName: 'Devon Cross',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Python 3.13 / FastAPI'],
          dependencies: [`${missionId}-2`],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-4`,
          title: 'Automated Pytest Regression Suite',
          description: 'Execute test assertions and ensure 100% test coverage.',
          expectedDeliverable: 'test_api.py (20/20 PASSED)',
          priority: 'HIGH',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-qa',
          assignedAgentName: 'Elena Rostova',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Pytest Automation'],
          dependencies: [`${missionId}-3`],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-5`,
          title: 'Docker Containerization & CI Pipeline',
          description: 'Build OCI Dockerfile and configure GitHub Actions workflow.',
          expectedDeliverable: 'Dockerfile & ci.yml',
          priority: 'MEDIUM',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-devops',
          assignedAgentName: 'Sora Takahashi',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Docker OCI Containers'],
          dependencies: [`${missionId}-4`],
          createdAt: new Date().toLocaleTimeString()
        }
      ];
    } else if (data.category === 'CONSTRUCTION') {
      mission.subtasks = [
        {
          id: `${missionId}-1`,
          title: 'Civil Architectural Schematics',
          description: 'Draft structural blueprints and municipal permits.',
          expectedDeliverable: 'blueprints.cad',
          priority: 'HIGH',
          status: 'WORKING',
          progress: 10,
          assignedAgentId: 'agent-architect',
          assignedAgentName: 'Marcus Vance',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Structural Engineering'],
          dependencies: [],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-2`,
          title: 'Foundation Steel & Crane Operations',
          description: 'Erect structural frames and poured concrete slabs.',
          expectedDeliverable: 'structural_frame',
          priority: 'HIGH',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-constructor',
          assignedAgentName: 'Harlan Drake',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Structural Construction'],
          dependencies: [`${missionId}-1`],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-3`,
          title: 'Grid Power & Utility Coupling',
          description: 'Connect high-voltage municipal grid lines.',
          expectedDeliverable: 'utility_certification',
          priority: 'MEDIUM',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-devops',
          assignedAgentName: 'Sora Takahashi',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Cloud Run Provisioning'],
          dependencies: [`${missionId}-2`],
          createdAt: new Date().toLocaleTimeString()
        }
      ];
    } else {
      mission.subtasks = [
        {
          id: `${missionId}-1`,
          title: 'Technical Investigation & Analysis',
          description: `Analyze objectives for ${data.title}`,
          expectedDeliverable: 'investigation_summary.md',
          priority: 'HIGH',
          status: 'WORKING',
          progress: 15,
          assignedAgentId: 'agent-diagnostic',
          assignedAgentName: 'Dr. Aaron Chen',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Traceback Deconstruction'],
          dependencies: [],
          createdAt: new Date().toLocaleTimeString()
        },
        {
          id: `${missionId}-2`,
          title: 'Implement Core Solution',
          description: `Execute core engineering for ${data.title}`,
          expectedDeliverable: 'solution_artifact',
          priority: 'HIGH',
          status: 'PENDING',
          progress: 0,
          assignedAgentId: 'agent-engineer',
          assignedAgentName: 'Devon Cross',
          source: 'PUBLIC_MISSION',
          publicMissionId: missionId,
          requiredSkills: ['Python 3.13 / FastAPI'],
          dependencies: [`${missionId}-1`],
          createdAt: new Date().toLocaleTimeString()
        }
      ];
    }

    mission.participatingAgentIds = Array.from(new Set(mission.subtasks.map(s => s.assignedAgentId)));

    // Mobilize participating agents
    mission.subtasks.forEach(st => {
      const ag = this.agentCharacters.find(a => a.id === st.assignedAgentId);
      if (ag) {
        if (!ag.activeTask) {
          ag.activeTask = st;
          ag.currentTask = st.title;
          ag.workProgress = st.progress;
          ag.status = st.status === 'WORKING' ? 'WORKING' : 'WAITING';
          ag.thoughtBubble = `Mobilized for "${mission.title.slice(0, 22)}..."`;
          ag.speechTimer = 5.0;
        } else {
          ag.taskQueue.push(st);
        }
      }
    });

    this.publicMissions.unshift(mission);
    this.activeMissionId = mission.id;
    this.saveToStorage();
    return mission;
  }

  // --- Handle Dependency Resolution When Subtask Completes ---
  private handleSubtaskCompleted(missionId: string, completedSubtaskId: string): void {
    const mission = this.publicMissions.find(m => m.id === missionId);
    if (!mission) return;

    // Calculate overall mission progress
    const total = mission.subtasks.length || 1;
    const completedCount = mission.subtasks.filter(s => s.status === 'COMPLETED').length;
    mission.progress = Math.round((completedCount / total) * 100);

    // Unlock dependent subtasks
    mission.subtasks.forEach(st => {
      if (st.status === 'PENDING') {
        const remainingDeps = st.dependencies.filter(depId => {
          const depTask = mission.subtasks.find(s => s.id === depId);
          return depTask && depTask.status !== 'COMPLETED';
        });

        if (remainingDeps.length === 0) {
          // Unlocked!
          st.status = 'WORKING';
          st.progress = 5;
          const ag = this.agentCharacters.find(a => a.id === st.assignedAgentId);
          if (ag) {
            ag.activeTask = st;
            ag.currentTask = st.title;
            ag.workProgress = 5;
            ag.status = 'WORKING';
            ag.thoughtBubble = `Starting unlocked task: ${st.title.slice(0, 24)}...`;
            ag.speechTimer = 5.0;
          }
        }
      }
    });

    // Check if entire mission is completed
    if (completedCount === total) {
      mission.status = 'COMPLETED';
      mission.progress = 100;
      mission.completedAt = new Date().toLocaleTimeString();
      mission.deliverables = mission.subtasks.map(s => s.deliverableResult || s.expectedDeliverable);

      // Real city state change!
      if (mission.category === 'CONSTRUCTION' && mission.targetBuildingId) {
        const b = this.buildings.find(item => item.id === mission.targetBuildingId);
        if (b) {
          b.underConstruction = false;
          b.constructionProgress = 100;
          b.workers = b.maxWorkers;
        }
      }

      this.metrics.citizenSatisfaction = Math.min(100, this.metrics.citizenSatisfaction + 4);
    }
  }

  public recalculateMetrics(): void {
    let totalPop = 0;
    let totalPowerReq = 0;
    let totalWaterReq = 0;
    let occupiedJobs = 0;

    this.buildings.forEach(b => {
      totalPop += b.residents;
      occupiedJobs += b.workers;
      totalPowerReq += b.powerDemand;
      totalWaterReq += b.waterDemand;
    });

    const openRoads = this.roads.filter(r => !r.isClosed);
    const avgDensity = openRoads.reduce((acc, r) => acc + r.density, 0) / (openRoads.length || 1);
    const congestionPct = Math.round(avgDensity * 100);

    this.metrics.population = totalPop;
    this.metrics.trafficCongestion = congestionPct;
    this.metrics.powerDemand = Math.round(totalPowerReq / 8);
    this.metrics.waterDemand = Math.round(totalWaterReq);
    this.metrics.powerGridStatus = this.metrics.powerProduction >= this.metrics.powerDemand 
      ? 100 
      : Math.round((this.metrics.powerProduction / this.metrics.powerDemand) * 100);
    this.metrics.waterGridStatus = this.metrics.waterSupply >= this.metrics.waterDemand 
      ? 100 
      : Math.round((this.metrics.waterSupply / this.metrics.waterDemand) * 100);
  }

  // --- Persistence with LocalStorage ---
  public saveToStorage(): void {
    try {
      const data = {
        missions: this.publicMissions,
        agentsHistory: this.agentCharacters.map(a => ({ 
          id: a.id, 
          history: a.taskHistory,
          chatHistory: a.chatHistory 
        })),
        timestamp: Date.now()
      };
      localStorage.setItem('forge_metropolis_sim_v1', JSON.stringify(data));
    } catch (e) {
      // storage error silently handled
    }
  }

  public loadFromStorage(): void {
    try {
      const raw = localStorage.getItem('forge_metropolis_sim_v1');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.missions && Array.isArray(data.missions) && data.missions.length > 0) {
          this.publicMissions = data.missions;
        }
        if (data.agentsHistory && Array.isArray(data.agentsHistory)) {
          data.agentsHistory.forEach((item: { id: string; history: any[]; chatHistory?: any[] }) => {
            const ag = this.agentCharacters.find(a => a.id === item.id);
            if (ag) {
              if (Array.isArray(item.history)) ag.taskHistory = item.history;
              if (Array.isArray(item.chatHistory) && item.chatHistory.length > 0) {
                ag.chatHistory = item.chatHistory;
              }
            }
          });
        }
      }
    } catch (e) {
      // parse error
    }
  }

  public loadScenario(scenario: ScenarioType): void {
    this.activeScenario = scenario;
    this.generateCityLayout();
    this.initAIAgentCharacters();
    this.initDefaultPublicMissions();
  }
}
