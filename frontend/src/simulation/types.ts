export type ZoneType = 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'PUBLIC' | 'PARK';
export type BuildingType = 
  | 'HOUSE' | 'APARTMENT' | 'SKYSCRAPER' | 'OFFICE_TOWER' | 'MALL' 
  | 'FACTORY' | 'WAREHOUSE' | 'SILO' | 'HOSPITAL' | 'SCHOOL' 
  | 'FIRE_STATION' | 'POWER_PLANT' | 'WATER_TOWER' | 'PARK_SPACE'
  | 'CONSTRUCTION';

export type RoofStyle = 'FLAT' | 'HELIPAD' | 'ANTENNA' | 'PITCHED' | 'CHIMNEY' | 'SCAFFOLDING';

export type VehicleType = 'CAR' | 'SUV' | 'BUS' | 'TRUCK' | 'FIRE_TRUCK' | 'AMBULANCE' | 'POLICE';
export type IncidentType = 'FIRE' | 'TRAFFIC_JAM' | 'POWER_OUTAGE' | 'WATER_BURST' | 'MEDICAL_EMERGENCY';
export type AgentRoleType = 
  | 'COORDINATOR' 
  | 'TRAFFIC' 
  | 'URBAN_PLANNER' 
  | 'ENERGY' 
  | 'WATER_WASTE' 
  | 'PUBLIC_SAFETY' 
  | 'ECONOMY' 
  | 'WELFARE';

export type CameraMode = 'ORBIT' | 'TOP_DOWN' | 'STREET_LEVEL' | 'FOLLOW_VEHICLE' | 'FPV' | 'SHOULDER_CAM' | 'TPV' | 'JET_CHASE' | 'JET_COCKPIT';
export type OverlayMode = 'NONE' | 'TRAFFIC' | 'POWER' | 'WATER' | 'ZONING' | 'SAFETY' | 'AGENT_PATHS';

export interface Building {
  id: string;
  name: string;
  zone: ZoneType;
  type: BuildingType;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  roofStyle: RoofStyle;
  facadeColor: string;
  color?: string; // backwards compatibility alias for facadeColor
  roofColor: string;
  accentColor: string;
  residents: number;
  maxResidents: number;
  workers: number;
  maxWorkers: number;
  powerDemand: number; // in kW
  powerSupplied: boolean;
  waterDemand: number; // in Liters/hr
  waterSupplied: boolean;
  wasteAccumulated: number; // 0 - 100
  underConstruction?: boolean;
  constructionProgress?: number; // 0 - 100
  onFire?: boolean;
  health: number; // 0 - 100
  signName?: string; // Floating architectural signboard name
  department?: string;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  expectedDeliverable: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'ASSIGNED' | 'TRAVELING' | 'WORKING' | 'VERIFYING' | 'COMPLETED' | 'BLOCKED' | 'REJECTED' | 'FAILED';
  progress: number; // 0 to 100
  assignedAgentId: string;
  assignedAgentName: string;
  source: 'INDIVIDUAL' | 'PUBLIC_MISSION';
  publicMissionId?: string;
  requiredSkills: string[];
  dependencies: string[]; // IDs of tasks that must be completed first
  deliverableResult?: string;
  blockerReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PublicMission {
  id: string;
  title: string;
  description: string;
  category: 'CONSTRUCTION' | 'SOFTWARE' | 'RESEARCH' | 'INFRASTRUCTURE' | 'SECURITY';
  status: 'PROPOSED' | 'IN_PROGRESS' | 'PAUSED' | 'VERIFYING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  progress: number; // 0 to 100
  subtasks: AgentTask[];
  participatingAgentIds: string[];
  blockers: string[];
  acceptanceCriteria: string[];
  deliverables: string[];
  publishedAt: string;
  completedAt?: string;
  targetBuildingId?: string;
}

export interface AgentCharacter {
  id: string;
  role: AgentRoleType;
  name: string;
  title: string;
  profession: string;
  department: string;
  color: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  angle: number;
  homeBuildingId: string;
  currentBuildingId?: string;
  currentTask: string;
  activeTask?: AgentTask | null;
  taskQueue: AgentTask[];
  taskHistory: { id: string; title: string; completedAt: string; deliverable: string }[];
  workProgress: number; // 0 - 100%
  availability: 'AVAILABLE' | 'BUSY' | 'ON_CALL';
  status: 'IDLE' | 'EVALUATING' | 'ASSIGNED' | 'TRAVELING' | 'WORKING' | 'VERIFYING' | 'COMPLETED' | 'WAITING' | 'BLOCKED';
  routinePhase?: 'DESK_WORK' | 'VERIFYING' | 'COFFEE_BREAK' | 'COLLABORATION' | 'TERRACE_THINKING';
  routineTimer?: number;
  currentDestinationName?: string;
  currentThought: string;
  thoughtBubble?: string;
  /** Real state from the backend (/api/agents); the 3D citizen only acts this out. */
  live?: { online: boolean; status: string; task: string | null; progress: number; thought: string | null };
  speechTimer?: number;
  avatarIcon: string;
  level: number;
  skills: string[];
  toolsInUse: string[];
  collaboratorIds: string[];
  isFPVActive?: boolean;
  chatHistory?: AgentChatMessage[];
  aiModel: string;
  aiProvider: string;
  aiModelBadgeColor: string;
  clothingStyle: 'CONSTRUCTION' | 'DOCTOR' | 'ARCHITECT' | 'ENGINEER' | 'QA' | 'SECURITY' | 'DEVOPS' | 'EXECUTIVE' | 'SCIENTIST' | 'DIAGNOSTIC';
  skinColor: string;
  hairColor: string;
}

export interface AgentChatMessage {
  id: string;
  sender: 'PLAYER' | 'AGENT';
  senderName: string;
  text: string;
  timestamp: string;
  actionTaken?: string;
  deliverableTitle?: string;
  deliverableUrl?: string;
  deliverablePath?: string;
  deliverableType?: '3D_PRESENTATION' | 'WEBSITE' | 'CODE' | 'SYSTEM_REPORT';
  artifactId?: string;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  isSprinting: boolean;
  isGrounded: boolean;
  isPointerLocked: boolean;
  nearbyAgentId: string | null;
  nearbyAgentDistance: number;
  isPilotingJet?: boolean;
  jetSpeed?: number;
  jetAltitude?: number;
  jetHeading?: number;
}

export interface UnitedProject {
  id: string;
  title: string;
  description: string;
  status: 'PLANNING' | 'ARCHITECTING' | 'IMPLEMENTING' | 'TESTING' | 'VERIFYING' | 'COMPLETED';
  progress: number; // 0 - 100%
  activeAgentId: string;
  startedAt: string;
  deliverables: string[];
  stageLogs: { timestamp: string; agentName: string; message: string; step: string }[];
}

export interface RoadSegment {
  id: string;
  start: [number, number];
  end: [number, number];
  lanes: number;
  density: number; // 0 (empty) - 1.0 (gridlock)
  speedLimit: number;
  isClosed: boolean;
  name: string;
  orientation: 'EW' | 'NS';
}

export interface Intersection {
  id: string;
  x: number;
  z: number;
  signalState: 'NS_GREEN' | 'EW_GREEN' | 'YELLOW';
  greenDuration: number;
  timer: number;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  x: number;
  z: number;
  y: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  color: string;
  roadId: string;
  progress: number; // 0.0 to 1.0 along road
  laneOffset: number; // lateral offset for driving on right side of road
  isEmergency: boolean;
  sirenActive?: boolean;
  originName: string;
  destinationName: string;
  targetIncidentId?: string;
  isWaitingAtSignal?: boolean;
}

export interface Pedestrian {
  id: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  angle: number;
  color: string;
  state: 'WALKING' | 'WAITING_CROSSWALK';
}

export interface Citizen {
  id: string;
  name: string;
  age: number;
  homeBuildingId: string;
  workBuildingId: string;
  state: 'AT_HOME' | 'COMMUTING_WORK' | 'AT_WORK' | 'COMMUTING_HOME' | 'RECREATION';
  satisfaction: number; // 0 - 100
  income: number;
  currentVehicleId?: string;
}

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  buildingId?: string;
  x: number;
  z: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'RESPONDING' | 'RESOLVED';
  timeRemaining: number; // seconds
  dispatchedVehicleId?: string;
  resolvedAt?: string;
}

export interface CityMetrics {
  population: number;
  employmentRate: number; // percentage
  avgCommuteTime: number; // minutes
  trafficCongestion: number; // 0 - 100%
  powerProduction: number; // MW
  powerDemand: number; // MW
  powerGridStatus: number; // % supplied
  waterSupply: number; // kL
  waterDemand: number; // kL
  waterGridStatus: number; // % supplied
  treasury: number; // $
  incomeRate: number; // $/tick
  expenseRate: number; // $/tick
  citizenSatisfaction: number; // 0 - 100
  activeIncidentsCount: number;
  carbonIndex: number;
}

export interface AgentObservation {
  agentRole: AgentRoleType;
  name: string;
  status: 'ANALYZING' | 'OPTIMIZING' | 'INTERVENING' | 'STANDBY';
  currentObjective: string;
  metricObserved: string;
  latestInsight: string;
  lastAction: string;
  lastOutcome: string;
  interventionsCount: number;
  confidenceScore: number;
}

export interface SimulationEvent {
  id: string;
  timestamp: string;
  agentRole?: AgentRoleType;
  category: 'TRAFFIC' | 'ENERGY' | 'WATER' | 'PLANNING' | 'SAFETY' | 'ECONOMY' | 'DISASTER';
  message: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  entityId?: string;
  x?: number;
  z?: number;
}

export type ScenarioType = 
  | 'BALANCED_METROPOLIS'
  | 'RUSH_HOUR_GRIDLOCK'
  | 'POWER_GRID_FAILURE'
  | 'INDUSTRIAL_FIRE_EMERGENCY'
  | 'WATER_SUPPLY_DROUGHT'
  | 'TECH_BOOM_EXPANSION';
