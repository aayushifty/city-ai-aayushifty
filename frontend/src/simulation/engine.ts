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

export interface LocationWaypoint {
  x: number;
  z: number;
  name: string;
  buildingId?: string;
}

export interface AgentWorkplaceConfig {
  desk: LocationWaypoint;
  testRig: LocationWaypoint;
  terrace: LocationWaypoint;
  collaboratorId: string;
}

export const AGENT_LOCATIONS: Record<string, AgentWorkplaceConfig> = {
  'agent-coordinator': {
    desk: { x: 0, z: -21, name: 'Citadel Master Orchestration Desk', buildingId: 'bld-citadel' },
    testRig: { x: 2.5, z: -22, name: 'Citadel DAG Cluster Control Rig', buildingId: 'bld-citadel' },
    terrace: { x: -2.5, z: -19, name: 'Citadel Spire Sky Deck', buildingId: 'bld-citadel' },
    collaboratorId: 'agent-architect'
  },
  'agent-analyst': {
    desk: { x: 21, z: 0, name: 'Vision Lab PRD Formulation Terminal', buildingId: 'bld-vision-lab' },
    testRig: { x: 22, z: 2.5, name: 'Vision Lab Contract Validation Station', buildingId: 'bld-vision-lab' },
    terrace: { x: 19, z: -2.5, name: 'Vision Lab Design Terrace', buildingId: 'bld-vision-lab' },
    collaboratorId: 'agent-coordinator'
  },
  'agent-architect': {
    desk: { x: 21, z: -21, name: 'Blueprint Complex Schema CAD Workstation', buildingId: 'bld-blueprint' },
    testRig: { x: 22.5, z: -23, name: 'Blueprint DDL Migration Testing Bench', buildingId: 'bld-blueprint' },
    terrace: { x: 19.5, z: -19.5, name: 'Blueprint Observation Balcony', buildingId: 'bld-blueprint' },
    collaboratorId: 'agent-engineer'
  },
  'agent-engineer': {
    desk: { x: -21, z: 21, name: 'Foundry Code Fabrication Terminal', buildingId: 'bld-foundry' },
    testRig: { x: -23, z: 22.5, name: 'Foundry Local Microservice Test Rig', buildingId: 'bld-foundry' },
    terrace: { x: -19.5, z: 19.5, name: 'Foundry Courtyard Patio', buildingId: 'bld-foundry' },
    collaboratorId: 'agent-qa'
  },
  'agent-qa': {
    desk: { x: -21, z: -21, name: 'QA Bastion Automated Regression Desk', buildingId: 'bld-qa-bastion' },
    testRig: { x: -22.5, z: -23, name: 'QA Bastion Fuzz Testing Rack', buildingId: 'bld-qa-bastion' },
    terrace: { x: -19.5, z: -19.5, name: 'QA Bastion North Porch', buildingId: 'bld-qa-bastion' },
    collaboratorId: 'agent-engineer'
  },
  'agent-diagnostic': {
    desk: { x: -21, z: 0, name: 'Diagnostic Core Telemetry Console', buildingId: 'bld-diagnostic' },
    testRig: { x: -23, z: -2.5, name: 'Diagnostic Kernel Tracing Bench', buildingId: 'bld-diagnostic' },
    terrace: { x: -19, z: 2.5, name: 'Diagnostic West Observation Deck', buildingId: 'bld-diagnostic' },
    collaboratorId: 'agent-security'
  },
  'agent-security': {
    desk: { x: 0, z: 21, name: 'Security Citadel Policy Enforcement Station', buildingId: 'bld-security' },
    testRig: { x: -2.5, z: 22, name: 'Security Sandbox Penetration Rig', buildingId: 'bld-security' },
    terrace: { x: 2.5, z: 19, name: 'Security Citadel Watchtower Walkway', buildingId: 'bld-security' },
    collaboratorId: 'agent-devops'
  },
  'agent-devops': {
    desk: { x: 21, z: 21, name: 'Release Dock CI/CD Pipeline Cockpit', buildingId: 'bld-release-dock' },
    testRig: { x: 23, z: 22.5, name: 'Release Dock Container Registry Rack', buildingId: 'bld-release-dock' },
    terrace: { x: 19.5, z: 19.5, name: 'Release Dock Promenade', buildingId: 'bld-release-dock' },
    collaboratorId: 'agent-coordinator'
  },
  'agent-constructor': {
    desk: { x: 0, z: 49, name: 'Civic Works Site Engineering Desk', buildingId: 'bld-construction' },
    testRig: { x: 2.5, z: 50, name: 'Civic Works Soil & Stress Rig', buildingId: 'bld-construction' },
    terrace: { x: -2.5, z: 47, name: 'Civic Works Scaffolding Vista', buildingId: 'bld-construction' },
    collaboratorId: 'agent-doctor'
  },
  'agent-doctor': {
    desk: { x: -21, z: 49, name: 'Civic Medical Trauma Director Desk', buildingId: 'bld-hospital' },
    testRig: { x: -23, z: 50.5, name: 'Civic Medical ICU Bio-Telemetry Station', buildingId: 'bld-hospital' },
    terrace: { x: -19, z: 47.5, name: 'Civic Hospital Wellness Garden Terrace', buildingId: 'bld-hospital' },
    collaboratorId: 'agent-constructor'
  }
};

export const AGENT_WORKPLACES: Record<string, { x: number; z: number; name: string; buildingId: string }> = Object.fromEntries(
  Object.entries(AGENT_LOCATIONS).map(([k, v]) => [k, { x: v.desk.x, z: v.desk.z, name: v.desk.name, buildingId: v.desk.buildingId || '' }])
);

export const SHARED_COMMUNAL_SPOTS: LocationWaypoint[] = [
  { x: 2.5, z: 2.5, name: 'Central Plaza Espresso Kiosk' },
  { x: -3.0, z: -3.0, name: 'Tech Courtyard Zen Garden & Fountain' },
  { x: 0.0, z: -4.0, name: 'Innovation Forum Amphitheater' },
  { x: 4.5, z: -2.0, name: 'Rooftop Skybridge Cafe' },
  { x: -2.5, z: 4.0, name: 'Civic Commons Plaza Pergola' }
];

export const SOFTWARE_TASK_CATALOG: Record<string, { title: string; description: string; expectedDeliverable: string; skills: string[] }[]> = {
  'agent-coordinator': [
    {
      title: 'Synthesize Multi-Agent DAG Orchestrator Pipeline',
      description: 'Orchestrate async multi-agent dependency graphs with topological sorting and cycle detection.',
      expectedDeliverable: 'dag_orchestrator.py',
      skills: ['DAG Scheduling', 'Resource Allocation']
    },
    {
      title: 'Validate Microservice State Machine Invariants',
      description: 'Verify state transitions and prevent race conditions across concurrent worker threads.',
      expectedDeliverable: 'state_machine_spec.json',
      skills: ['Task Decomposition', 'Deadlock Resolution']
    },
    {
      title: 'Implement Async Event Bus Dispatcher with Backpressure',
      description: 'Construct high-throughput non-blocking event streaming layer for city-wide IPC.',
      expectedDeliverable: 'event_dispatcher.py',
      skills: ['Task Decomposition', 'DAG Scheduling']
    },
    {
      title: 'Auto-balance Citizen Workload & Prevent Thread Starvation',
      description: 'Dynamic load balancing across active agents and background thread workers.',
      expectedDeliverable: 'workload_balancer.py',
      skills: ['Resource Allocation', 'Deadlock Resolution']
    }
  ],
  'agent-analyst': [
    {
      title: 'Draft OpenAPI 3.1 Contract for Autonomous Services',
      description: 'Synthesize formal OpenAPI specifications with Pydantic request/response body schemas.',
      expectedDeliverable: 'openapi_schema.yaml',
      skills: ['Contract Verification', 'PRD Formulation']
    },
    {
      title: 'Synthesize Acceptance Criteria & Gherkin Scenarios',
      description: 'Generate Given/When/Then behavior-driven test scenarios for filesystem sandboxing.',
      expectedDeliverable: 'features_acceptance.feature',
      skills: ['Acceptance Testing', 'User Stories']
    },
    {
      title: 'Formulate Micro-Frontend Interface Specifications',
      description: 'Define type-safe contract interfaces between 3D WebGL runtime and React HUD state.',
      expectedDeliverable: 'system_prd_v2.md',
      skills: ['PRD Formulation', 'Contract Verification']
    },
    {
      title: 'Audit Software Requirements Traceability Matrix',
      description: 'Cross-reference functional requirements against integration test coverage.',
      expectedDeliverable: 'requirements_matrix.json',
      skills: ['User Stories', 'Acceptance Testing']
    }
  ],
  'agent-architect': [
    {
      title: 'Model SQLite Relational Schema with Foreign Keys',
      description: 'Design normalized SQLite schema with strict type constraints, indexes, and CASCADE relations.',
      expectedDeliverable: 'schema_ddl.sql',
      skills: ['Schema Normalization', 'Clean Architecture']
    },
    {
      title: 'Refactor Domain Entities with Pydantic V2 Strict Types',
      description: 'Enforce type validation and immutable value objects across domain boundary layers.',
      expectedDeliverable: 'domain_models.py',
      skills: ['Type Hints', 'Clean Architecture']
    },
    {
      title: 'Architect High-Throughput Event-Driven PubSub Topology',
      description: 'Decouple ingestion services from core simulation loop using non-blocking queues.',
      expectedDeliverable: 'pubsub_topology.md',
      skills: ['Structural Engineering', 'Clean Architecture']
    },
    {
      title: 'Normalize City Simulation Database Query Execution Plans',
      description: 'Optimize B-tree index coverage to eliminate full-table scans during 60 FPS state sync.',
      expectedDeliverable: 'db_indexes.sql',
      skills: ['Schema Normalization', 'Type Hints']
    }
  ],
  'agent-engineer': [
    {
      title: 'Implement FastAPI Async REST Route Controllers',
      description: 'Build robust asynchronous endpoints with input validation and zero silent failures.',
      expectedDeliverable: 'api_routes.py',
      skills: ['Python 3.13 / FastAPI', 'AsyncIO Concurrency']
    },
    {
      title: 'Synthesize Three.js Custom PBR Cyber Shader Material',
      description: 'Author GLSL vertex and fragment shaders for real-time cybernetic illumination.',
      expectedDeliverable: 'CyberShader.glsl',
      skills: ['TypeScript / React', 'AsyncIO Concurrency']
    },
    {
      title: 'Develop High-Speed JSON-RPC Streaming Client',
      description: 'Implement bidirectional WebSocket stream parser with binary frame compression.',
      expectedDeliverable: 'stream_handler.py',
      skills: ['Python 3.13 / FastAPI', 'SQLAlchemy / SQLite']
    },
    {
      title: 'Implement Thread-Safe Concurrent Ring Buffer',
      description: 'Create zero-allocation lockless circular buffer for high-frequency telemetry frames.',
      expectedDeliverable: 'ring_buffer.py',
      skills: ['AsyncIO Concurrency', 'Python 3.13 / FastAPI']
    }
  ],
  'agent-qa': [
    {
      title: 'Construct Pytest Async Integration Test Suite',
      description: 'Author 20/20 test cases with mock fixtures, network isolation, and assertion contracts.',
      expectedDeliverable: 'test_integration_suite.py',
      skills: ['Pytest Automation', 'Regression Verification']
    },
    {
      title: 'Verify AST Syntax Trees & Type Completeness',
      description: 'Static analysis parser ensuring zero any-types, no bare excepts, and 100% docstrings.',
      expectedDeliverable: 'ast_type_check.py',
      skills: ['Coverage Profiling', 'Mutation Testing']
    },
    {
      title: 'Run Regression Coverage Suite on Core API Endpoints',
      description: 'Execute statement and branch coverage report with 95%+ threshold enforcement.',
      expectedDeliverable: 'coverage_report.json',
      skills: ['Pytest Automation', 'Coverage Profiling']
    },
    {
      title: 'Validate Boundary Condition Invariants & Edge Cases',
      description: 'Test fuzzing on HTTP request payloads and malformed JSON telemetry inputs.',
      expectedDeliverable: 'boundary_tests.py',
      skills: ['Mutation Testing', 'Regression Verification']
    }
  ],
  'agent-diagnostic': [
    {
      title: 'Analyze Async Deadlock in Task Scheduling Loop',
      description: 'Trace mutex lock acquisition order and eliminate circular dependency deadlocks.',
      expectedDeliverable: 'deadlock_fix_patch.py',
      skills: ['Traceback Deconstruction', 'Heuristic Repair']
    },
    {
      title: 'Profile Process Memory Allocation & Detect Heap Bloat',
      description: 'Inspect tracemalloc heap snapshots and eliminate memory retention in event bus.',
      expectedDeliverable: 'memory_profile_report.json',
      skills: ['Memory Profiling', 'Log Inspection']
    },
    {
      title: 'Implement Self-Healing Recovery Hook for Network Timeouts',
      description: 'Automatic retry backoff with exponential jitter for upstream inference calls.',
      expectedDeliverable: 'circuit_breaker.py',
      skills: ['Heuristic Repair', 'Traceback Deconstruction']
    },
    {
      title: 'Perform Root Cause Analysis on Unhandled Exceptions',
      description: 'Deconstruct Python tracebacks, generate reproduction test cases, and commit fixes.',
      expectedDeliverable: 'rca_report_v2.md',
      skills: ['Log Inspection', 'Traceback Deconstruction']
    }
  ],
  'agent-security': [
    {
      title: 'Audit Subprocess Shell Invocations & Escape Sequences',
      description: 'Scan all command execution paths to prevent shell injection and parameter tampering.',
      expectedDeliverable: 'security_audit.py',
      skills: ['Path Traversal Jail', 'OWASP Vulnerability Audit']
    },
    {
      title: 'Enforce Zero-Trust JWT Authentication Policies',
      description: 'Validate RS256 token signatures, expiration claims, and role-based access controls.',
      expectedDeliverable: 'jwt_authorizer.py',
      skills: ['Command Whitelisting', 'Secret Redaction']
    },
    {
      title: 'Verify Filesystem Path Jail Containment Sandbox',
      description: 'Ensure all agent filesystem writes are strictly bounded within authorized workspace directories.',
      expectedDeliverable: 'path_sandbox.py',
      skills: ['Path Traversal Jail', 'Command Whitelisting']
    },
    {
      title: 'Scan Dependency Graph for Known CVE Vulnerabilities',
      description: 'Audit requirements.txt and package.json against vulnerability database.',
      expectedDeliverable: 'cve_vulnerability_scan.json',
      skills: ['OWASP Vulnerability Audit', 'Secret Redaction']
    }
  ],
  'agent-devops': [
    {
      title: 'Author Multi-Stage Distroless OCI Dockerfile',
      description: 'Package backend service into minimal non-root distroless container under 65MB.',
      expectedDeliverable: 'Dockerfile.distroless',
      skills: ['Docker OCI Containers', 'CI/CD Pipelines']
    },
    {
      title: 'Configure Automated GitHub Actions CI Matrix Workflow',
      description: 'Multi-platform test matrix (Ubuntu/Windows/macOS) with caching and automated linting.',
      expectedDeliverable: 'ci_workflow.yaml',
      skills: ['CI/CD Pipelines', 'Cloud Run Provisioning']
    },
    {
      title: 'Implement Prometheus Metrics Exporter & Alerting',
      description: 'Instrument request latency histograms, error rates, and memory gauges.',
      expectedDeliverable: 'prometheus_exporter.py',
      skills: ['Health Monitoring', 'Docker OCI Containers']
    },
    {
      title: 'Tune Nginx Reverse Proxy with Brotli & HTTP/2',
      description: 'Configure high-performance reverse proxy with SSL termination and keepalive pools.',
      expectedDeliverable: 'nginx_production.conf',
      skills: ['Cloud Run Provisioning', 'Health Monitoring']
    }
  ],
  'agent-constructor': [
    {
      title: 'Optimize Vite Bundler Chunks & Tree-Shaking Splitting',
      description: 'Split vendor dependencies and Three.js geometry buffers for sub-second load times.',
      expectedDeliverable: 'vite.config.optimized.ts',
      skills: ['Site Safety', 'Material Sourcing']
    },
    {
      title: 'Generate Strict TypeScript Declaration Typings',
      description: 'Export ambient type definitions for city simulation engine and 3D visualizers.',
      expectedDeliverable: 'forge_ambient.d.ts',
      skills: ['Structural Construction', 'Site Safety']
    },
    {
      title: 'Benchmark WebGL Draw Calls & Buffer Merging',
      description: 'Profile GPU draw calls and merge road/building geometries into instanced meshes.',
      expectedDeliverable: 'draw_call_benchmark.json',
      skills: ['Heavy Machinery Operation', 'Structural Construction']
    },
    {
      title: 'Automate Monorepo Package Linking & Build Cache',
      description: 'Configure TurboRepo build pipeline for instant incremental compilation.',
      expectedDeliverable: 'turbo_pipeline.json',
      skills: ['Material Sourcing', 'Heavy Machinery Operation']
    }
  ],
  'agent-doctor': [
    {
      title: 'Monitor Host CPU & GPU Hardware Thermals Telemetry',
      description: 'Collect live thermal and clock frequencies across CPU cores and NVIDIA RTX GPU.',
      expectedDeliverable: 'hardware_vitals.py',
      skills: ['Hospital Operations', 'Medical Telemetry']
    },
    {
      title: 'Profile Async Event Loop Lag & Frame Jitter',
      description: 'Measure execution delay in milliseconds to guarantee buttery 60 FPS performance.',
      expectedDeliverable: 'event_loop_profiler.py',
      skills: ['Triage Protocol', 'Biohazard Containment']
    },
    {
      title: 'Compile Real-Time Resilience Health Dashboard',
      description: 'Aggregate service uptime, database lock latencies, and circuit breaker status.',
      expectedDeliverable: 'system_vitals_summary.json',
      skills: ['Hospital Operations', 'Triage Protocol']
    },
    {
      title: 'Verify SQLite WAL Lock Contention & Checkpoints',
      description: 'Ensure WAL checkpoint frequency avoids write stalls and keeps concurrency high.',
      expectedDeliverable: 'db_pool_diagnostics.py',
      skills: ['Emergency Medicine', 'Medical Telemetry']
    }
  ]
};

export class ProceduralSoftwareFactory {
  private static taskCounters: Record<string, number> = {};

  private static verbs = [
    'Implement', 'Refactor', 'Benchmark', 'Harden', 'Profile', 'Synthesize',
    'Architect', 'Optimize', 'Integrate', 'Decouple', 'Audit', 'Calibrate',
    'Verify', 'Deploy', 'Construct'
  ];

  private static roleBlueprints: Record<string, {
    subsystems: string[];
    invariants: string[];
    deliverableBase: string;
    ext: string;
    skills: string[];
  }> = {
    'agent-coordinator': {
      subsystems: [
        'Multi-Agent Async DAG Orchestrator Pipeline',
        'Dynamic Citizen Workload Balancing & Task Dispatcher',
        'Asynchronous Distributed IPC Event Stream Bus',
        'Cross-Department Mission Dependency State Machine',
        'Deadlock Prevention & Mutex Arbitrator',
        'Topological Pipeline Scheduler with Exponential Backoff'
      ],
      invariants: [
        'enforcing zero cycle deadlocks and sub-millisecond dispatch',
        'maintaining topological dependency integrity across workers',
        'with automatic backpressure relief under heavy load',
        'guaranteeing bounded latency and FIFO message delivery'
      ],
      deliverableBase: 'dag_orchestrator',
      ext: 'py',
      skills: ['DAG Scheduling', 'Resource Allocation', 'Task Decomposition']
    },
    'agent-analyst': {
      subsystems: [
        'OpenAPI 3.1 Contract Specification & Schemas',
        'Behavior-Driven Gherkin Acceptance Test Matrix',
        'Autonomous Service Requirements Traceability Graph',
        'Micro-Frontend State Contract & Event Bus Schema',
        'REST Endpoint Input/Output Pydantic Validation Models',
        'Domain Boundary Feature Request Matrix & SLA Guidelines'
      ],
      invariants: [
        'with strict Pydantic v2 schemas and zero untyped fields',
        'covering 100% of user journey edge-cases and error paths',
        'enforcing formal OpenAPI validation against spec standards',
        'guaranteeing backward compatibility with legacy endpoints'
      ],
      deliverableBase: 'openapi_schema',
      ext: 'yaml',
      skills: ['PRD Formulation', 'Contract Verification', 'Acceptance Testing']
    },
    'agent-architect': {
      subsystems: [
        'Normalized SQLite Relational DDL Schema with Foreign Keys',
        'Hexagonal Architecture Port-and-Adapter Interfaces',
        'Domain Entity Value Objects & Strict Type Models',
        'Optimized SQLite WAL Pragmas & Concurrency Tuning',
        'Event-Sourcing Audit Log & Replay Event Bus',
        'Clean Architecture Repository Layer & Data Transfer Objects'
      ],
      invariants: [
        'enforcing strict foreign key CASCADE and indexed lookups',
        'guaranteeing zero circular dependency cycles between packages',
        'with sub-2ms query execution across 100k simulated rows',
        'strictly decoupling domain entities from external framework code'
      ],
      deliverableBase: 'domain_schema',
      ext: 'sql',
      skills: ['Schema Normalization', 'Clean Architecture', 'Type Hints']
    },
    'agent-engineer': {
      subsystems: [
        'Production FastAPI Async REST Controller with SQLite WAL',
        'High-Performance WebGL Shaders & Instanced Geometry Mesh',
        'Interactive Three.js Particle Nebula & Horizon Visualizer',
        'Non-Blocking Web Worker Multi-Thread Compute Pool',
        'Robust Error-Handled Client-Side Virtual Memory Cache',
        'Real-Time Server-Sent Events (SSE) Streaming Pipeline'
      ],
      invariants: [
        'guaranteeing silky smooth 60 FPS under intensive draw calls',
        'with complete defensive input sanitization and zero uncaught exceptions',
        'achieving sub-5ms latency under concurrent load',
        'strictly following Clean Architecture with clear interface boundaries'
      ],
      deliverableBase: 'api_controller',
      ext: 'py',
      skills: ['Python 3.13 / FastAPI', 'TypeScript / React', 'Async Concurrency']
    },
    'agent-qa': {
      subsystems: [
        '20/20 Pytest Automated Verification Suite with Fixtures',
        'Chaos Latency & Fault Injection Regression Harness',
        'Property-Based Fuzz Testing Harness for API Boundaries',
        'End-to-End Headless Browser Integration Matrix',
        'Automated Memory Leak & Retain Cycle Probing Rig',
        'Negative Boundary & Malformed JSON Attack Test Suite'
      ],
      invariants: [
        'with 100% green passing assertion report and zero regressions',
        'verifying that all invalid inputs return structured HTTP 422 errors',
        'detecting and flagging sub-millisecond memory leaks',
        'ensuring deterministic repeatable test fixtures in isolated sandbox'
      ],
      deliverableBase: 'pytest_regression',
      ext: 'py',
      skills: ['Pytest Suites', 'Chaos Engineering', 'Regression Testing']
    },
    'agent-diagnostic': {
      subsystems: [
        'Deep Telemetry Diagnostic Probe & Call Stack Traceback',
        'Kernel Syscall & Async Event Loop Latency Profiler',
        'Host Hardware Thermal & High-Resolution RAM Heap Monitor',
        'Deadlock & Thread Contention Diagnostic Sniffer',
        'Network Socket Connection Pool & Keep-Alive Profiler',
        'Tick Budget & Frame Jitter Telemetry Aggregator'
      ],
      invariants: [
        'isolating the root cause within 2 simulation ticks',
        'generating actionable telemetry flamegraphs and stack traces',
        'pinpointing CPU cycle bottlenecks with zero telemetry overhead',
        'capturing microsecond memory spikes before OOM thresholds'
      ],
      deliverableBase: 'telemetry_rca',
      ext: 'json',
      skills: ['Traceback Deconstruction', 'Root Cause Analysis', 'Performance Profiling']
    },
    'agent-security': {
      subsystems: [
        'Zero-Trust Filesystem Path Jail & Sandbox Guard',
        'AST-Level Command Injection Sanitizer & Whitelist Shield',
        'Cryptographic Token Rotation & Secret Key Vault',
        'Rate-Limiting Token Bucket Defense & DDoS Shield',
        'OWASP Top-10 API Security Policy Enforcer',
        'Sandboxed Subprocess Execution Shield with Strict Capabilities'
      ],
      invariants: [
        'blocking 100% of directory traversal and path escape attempts',
        'stripping malicious shell injection primitives from commands',
        'enforcing zero-trust mutual authentication across internal RPCs',
        'guaranteeing audit logs cannot be tampered with or truncated'
      ],
      deliverableBase: 'security_jail_guard',
      ext: 'py',
      skills: ['Zero-Trust Architecture', 'Penetration Testing', 'Cryptographic Vaults']
    },
    'agent-devops': {
      subsystems: [
        'Multi-Stage Docker OCI Image with Non-Root User',
        'GitHub Actions Matrix CI/CD Automated Workflow',
        'Prometheus Metrics Exporter & System Telemetry Endpoint',
        'Production Docker Compose Orchestrator with Healthchecks',
        'Zero-Downtime Rolling Blue/Green Deployment Script',
        'Automated Semantic Versioning & Artifact Bundler'
      ],
      invariants: [
        'producing minimal hardened images under 50MB with zero CVEs',
        'executing CI validation and artifact generation in sub-30s',
        'with automatic health probes and instant rollback capabilities',
        'guaranteeing deterministic repeatable multi-platform builds'
      ],
      deliverableBase: 'ci_pipeline',
      ext: 'yaml',
      skills: ['Docker OCI', 'CI/CD Pipelines', 'Cloud Run Provisioning']
    },
    'agent-constructor': {
      subsystems: [
        'Subterranean Geotechnical Piling & Foundation Grid',
        'Structural Titanium Girder & Pillar CAD Schematics',
        'Municipal Underground High-Voltage Power Conduit Grid',
        'Reinforced Concrete Shear-Wall & Foundation Footings',
        'Civic High-Capacity Aqueduct & Pressure Valve Grid',
        'Heavy Crane Rigging & Prefabricated Superstructure Assembly'
      ],
      invariants: [
        'certified for Category-5 seismic and high-wind structural loads',
        'strictly complying with Municipal Building Code Chapter 104-B',
        'tested under 500-ton static stress loading with zero deflection',
        'with millimeter-accurate laser telemetry across all foundation pilings'
      ],
      deliverableBase: 'civic_structure',
      ext: 'spec',
      skills: ['Heavy Machinery Operation', 'Structural Construction', 'Site Safety']
    },
    'agent-doctor': {
      subsystems: [
        'Host CPU/GPU Thermal & Real-Time Bio-Vitals Telemetry Probe',
        'Emergency Trauma Bay ICU Bed Allocation & Life Support Grid',
        'Metropolis Environmental Air Quality & Aerosol Sniffer',
        'Mobile Ambulance Fast-Response Dispatch Routing Algorithm',
        'Autonomous Civic Medical Dispensary & Triage Protocol',
        'Citizen Wellness & Cognitive Fatigue Monitoring System'
      ],
      invariants: [
        'maintaining city health index above 96.5% under all conditions',
        'triggering instant thermal alerts whenever GPU thermals exceed 72°C',
        'guaranteeing sub-15 second medical response across all city zones',
        'monitoring continuous biometric vitals for 3,450 citizens'
      ],
      deliverableBase: 'medical_vitals',
      ext: 'json',
      skills: ['Hospital Operations', 'Medical Telemetry', 'Triage Protocol']
    }
  };

  public static generateTask(agId: string, agName: string, priority: AgentTask['priority'] = 'HIGH'): AgentTask {
    const blueprint = this.roleBlueprints[agId] || this.roleBlueprints['agent-engineer'];
    const count = (this.taskCounters[agId] = (this.taskCounters[agId] || 0) + 1);

    const verb = this.verbs[Math.floor(Math.random() * this.verbs.length)];
    const subsystem = blueprint.subsystems[Math.floor(Math.random() * blueprint.subsystems.length)];
    const invariant = blueprint.invariants[Math.floor(Math.random() * blueprint.invariants.length)];
    const rev = `${count.toString().padStart(3, '0')}`;
    const hash = Math.random().toString(36).substring(2, 6);

    const title = `${verb} ${subsystem}`;
    const description = `${verb} ${subsystem.toLowerCase()} for the city platform, ${invariant}.`;
    const deliverable = `${blueprint.deliverableBase}_v${rev}_${hash}.${blueprint.ext}`;

    return {
      id: `task-${agId}-${Date.now().toString(36)}-${hash}`,
      title,
      description,
      expectedDeliverable: deliverable,
      priority,
      status: 'WORKING',
      progress: 0,
      assignedAgentId: agId,
      assignedAgentName: agName,
      source: 'INDIVIDUAL',
      requiredSkills: blueprint.skills,
      dependencies: [],
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }
}

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
  public taskCounters: Record<string, number> = {};

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
    nearbyAgentDistance: 999,
    isPilotingJet: false,
    jetSpeed: 0,
    jetAltitude: 0,
    jetHeading: 0
  };

  public simulationTime: number = 12.0; // 12.0 (High Noon Daylight - Always Bright)
  public simulationSpeed: number = 1.0;
  public tickCount: number = 0;
  public activeScenario: ScenarioType = 'BALANCED_METROPOLIS';

  public generateAutonomousSoftwareTask(agId: string, agName: string): AgentTask {
    return ProceduralSoftwareFactory.generateTask(agId, agName);
  }

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

    // Landmark 11: Civic Works & Heavy Construction Yard (Harlan Drake HQ)
    this.buildings.push({
      id: 'bld-construction',
      name: 'Civic Works & Heavy Construction Yard',
      signName: 'CIVIC WORKS',
      department: 'Infrastructure Construction & Site Engineering',
      zone: 'INDUSTRIAL',
      type: 'CONSTRUCTION',
      x: 0,
      z: 56,
      width: 13,
      depth: 13,
      height: 22,
      floors: 3,
      roofStyle: 'SCAFFOLDING',
      facadeColor: '#EA580C',
      color: '#EA580C',
      roofColor: '#78350F',
      accentColor: '#FACC15',
      residents: 0,
      maxResidents: 0,
      workers: 110,
      maxWorkers: 180,
      powerDemand: 42,
      powerSupplied: true,
      waterDemand: 320,
      waterSupplied: true,
      wasteAccumulated: 16,
      underConstruction: true,
      health: 100
    });

    // Add surrounding residential, commercial, and suburban housing blocks
    let bCount = 12;
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
        department: 'Civic Works & Heavy Construction Yard',
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
        homeBuildingId: 'bld-construction',
        currentBuildingId: 'bld-construction',
        currentTask: 'Managing structural engineering and building site progress',
        taskQueue: [],
        taskHistory: [
          { id: 'hist-9', title: 'Foundation Survey for Civic Construction Yard', completedAt: '09:50 AM', deliverable: 'Site structural integrity certified.' }
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

    // Initialize each agent with natural human lifecycle, domain workplace desk, and procedural tasks
    this.agentCharacters.forEach((ag, idx) => {
      const loc = AGENT_LOCATIONS[ag.id];
      if (loc) {
        ag.x = loc.desk.x;
        ag.z = loc.desk.z;
        ag.targetX = loc.desk.x;
        ag.targetZ = loc.desk.z;
        ag.homeBuildingId = loc.desk.buildingId || ag.homeBuildingId;
        ag.currentBuildingId = loc.desk.buildingId || ag.homeBuildingId;
        ag.currentDestinationName = loc.desk.name;
      }
      ag.routinePhase = 'DESK_WORK';
      // Stagger timers naturally across the 10 citizens
      ag.routineTimer = 16.0 + ((idx * 3.5) % 14.0);
      ag.speed = 2.4;

      const initialTask = ProceduralSoftwareFactory.generateTask(ag.id, ag.name);
      initialTask.progress = 25 + ((idx * 8) % 40);
      initialTask.status = 'WORKING';
      ag.activeTask = initialTask;
      ag.workProgress = initialTask.progress;
      ag.status = 'WORKING';
      ag.availability = 'BUSY';
      ag.currentTask = initialTask.title;
      ag.thoughtBubble = `Coding: ${initialTask.expectedDeliverable}`;
      ag.speechTimer = 7.0 + (idx % 4);

      // 3 Queued domain procedural tasks
      ag.taskQueue = [
        ProceduralSoftwareFactory.generateTask(ag.id, ag.name),
        ProceduralSoftwareFactory.generateTask(ag.id, ag.name),
        ProceduralSoftwareFactory.generateTask(ag.id, ag.name)
      ];
    });
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

    // Daytime High Noon Clock (Stays between 11:00 AM and 1:30 PM for permanent bright visibility)
    this.simulationTime = 12.0 + (Math.sin(this.tickCount * 0.0003) * 1.5);

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

    // 4. Update AI Agent Behavioral State Machine & Natural Human Routine Lifecycles
    this.agentCharacters.forEach(ag => {
      const loc = AGENT_LOCATIONS[ag.id];
      if (!loc) return;

      // Decrement speech bubble timer
      if (ag.speechTimer !== undefined) {
        ag.speechTimer -= effectiveDelta;
        if (ag.speechTimer <= 0) {
          ag.thoughtBubble = undefined;
        }
      }

      // Initialize routine timers if undefined
      if (ag.routineTimer === undefined) {
        ag.routineTimer = 20.0;
      }
      ag.routineTimer -= effectiveDelta;

      if (!ag.routinePhase) {
        ag.routinePhase = 'DESK_WORK';
      }

      // Smooth Natural Human Walking to Destination
      const dx = ag.targetX - ag.x;
      const dz = ag.targetZ - ag.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.35) {
        const walkSpeed = ag.speed || 2.4;
        const step = Math.min(dist, walkSpeed * effectiveDelta);
        ag.x += (dx / dist) * step;
        ag.z += (dz / dist) * step;
        ag.angle = Math.atan2(dz, dx);
        ag.status = 'TRAVELING';
      } else {
        ag.x = ag.targetX;
        ag.z = ag.targetZ;
      }

      // 5-Phase Natural Human Routine State Machine
      switch (ag.routinePhase) {
        case 'DESK_WORK': {
          if (dist <= 0.4) {
            ag.status = 'WORKING';
            ag.availability = 'BUSY';

            // Ensure active procedural software task
            if (!ag.activeTask) {
              ag.activeTask = ag.taskQueue.length > 0 
                ? ag.taskQueue.shift()! 
                : ProceduralSoftwareFactory.generateTask(ag.id, ag.name);
              ag.workProgress = 0;
              ag.currentTask = ag.activeTask.title;
            }

            // Coding progress from 0% to 75%
            if (ag.workProgress < 75) {
              ag.workProgress = Math.min(75, ag.workProgress + effectiveDelta * 4.8);
              ag.activeTask.progress = Math.round(ag.workProgress);

              if (!ag.thoughtBubble || ag.speechTimer === undefined || ag.speechTimer <= 0) {
                const codingThoughts = [
                  `Coding: ${ag.activeTask.expectedDeliverable}`,
                  `Synthesizing logic for ${ag.activeTask.title.slice(0, 24)}...`,
                  `Refactoring architecture in ${ag.activeTask.expectedDeliverable}`,
                  `Writing type-safe domain contracts for ${ag.name}...`
                ];
                ag.thoughtBubble = codingThoughts[Math.floor(Math.random() * codingThoughts.length)];
                ag.speechTimer = 5.0;
              }
            }

            // Transition to VERIFYING at nearby test station when coding milestone reached
            if (ag.workProgress >= 75 || ag.routineTimer <= 0) {
              ag.routinePhase = 'VERIFYING';
              ag.routineTimer = 12.0 + Math.random() * 6.0;
              ag.targetX = loc.testRig.x;
              ag.targetZ = loc.testRig.z;
              ag.currentDestinationName = loc.testRig.name;
              ag.thoughtBubble = `Moving to test rig for ${ag.activeTask.expectedDeliverable}`;
              ag.speechTimer = 4.5;
            }
          } else {
            // Walking towards desk
            ag.targetX = loc.desk.x;
            ag.targetZ = loc.desk.z;
            ag.currentDestinationName = loc.desk.name;
          }
          break;
        }

        case 'VERIFYING': {
          if (dist <= 0.4) {
            ag.status = 'VERIFYING';
            ag.availability = 'BUSY';

            if (ag.activeTask && ag.workProgress < 100) {
              ag.workProgress = Math.min(100, ag.workProgress + effectiveDelta * 5.2);
              ag.activeTask.progress = Math.round(ag.workProgress);

              if (!ag.thoughtBubble || ag.speechTimer === undefined || ag.speechTimer <= 0) {
                const verifyThoughts = [
                  `Running pytest suite on ${ag.activeTask.expectedDeliverable}...`,
                  `Executing 20/20 test assertions: 0 regressions`,
                  `Verifying schema invariant checks and zero leaks`,
                  `Validating deliverable artifact on hardware test bench`
                ];
                ag.thoughtBubble = verifyThoughts[Math.floor(Math.random() * verifyThoughts.length)];
                ag.speechTimer = 4.0;
              }
            }

            // Task completion & transition to human social break
            if (ag.workProgress >= 100 || ag.routineTimer <= 0) {
              if (ag.activeTask) {
                ag.activeTask.status = 'COMPLETED';
                ag.activeTask.progress = 100;
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                ag.activeTask.completedAt = timeStr;
                ag.activeTask.deliverableResult = `Verified deliverable: ${ag.activeTask.expectedDeliverable} generated by ${ag.name} (100% assertions passed)`;

                ag.taskHistory.unshift({
                  id: ag.activeTask.id,
                  title: ag.activeTask.title,
                  completedAt: timeStr,
                  deliverable: ag.activeTask.deliverableResult
                });
                if (ag.taskHistory.length > 15) ag.taskHistory.pop();

                if (ag.activeTask.publicMissionId) {
                  this.handleSubtaskCompleted(ag.activeTask.publicMissionId, ag.activeTask.id);
                }
              }

              ag.thoughtBubble = `✓ Verified: ${ag.activeTask?.expectedDeliverable || 'Deliverable'}!`;
              ag.speechTimer = 4.5;
              ag.activeTask = null; // Cleared so new unique task is drawn after break

              // Natural Human Break Selection
              // 40% Plaza espresso kiosk
              // 35% Colleague collaboration
              // 25% Terrace thinking
              const rand = Math.random();
              if (rand < 0.40) {
                ag.routinePhase = 'COFFEE_BREAK';
                ag.routineTimer = 16.0 + Math.random() * 8.0;
                const spot = SHARED_COMMUNAL_SPOTS[Math.floor(Math.random() * SHARED_COMMUNAL_SPOTS.length)];
                ag.targetX = spot.x;
                ag.targetZ = spot.z;
                ag.currentDestinationName = spot.name;
              } else if (rand < 0.75) {
                ag.routinePhase = 'COLLABORATION';
                ag.routineTimer = 18.0 + Math.random() * 8.0;
                const colleagueId = loc.collaboratorId;
                const colleagueLoc = AGENT_LOCATIONS[colleagueId] || loc;
                const colleague = this.agentCharacters.find(a => a.id === colleagueId);
                ag.targetX = colleagueLoc.terrace.x;
                ag.targetZ = colleagueLoc.terrace.z;
                ag.currentDestinationName = `${colleague?.name || 'Colleague'}'s Office Terrace`;
              } else {
                ag.routinePhase = 'TERRACE_THINKING';
                ag.routineTimer = 14.0 + Math.random() * 8.0;
                ag.targetX = loc.terrace.x;
                ag.targetZ = loc.terrace.z;
                ag.currentDestinationName = loc.terrace.name;
              }
            }
          } else {
            ag.targetX = loc.testRig.x;
            ag.targetZ = loc.testRig.z;
            ag.currentDestinationName = loc.testRig.name;
          }
          break;
        }

        case 'COFFEE_BREAK': {
          ag.status = 'IDLE';
          ag.availability = 'ON_CALL';
          if (dist <= 0.4) {
            if (!ag.thoughtBubble || ag.speechTimer === undefined || ag.speechTimer <= 0) {
              const breakThoughts = [
                `Grabbing an espresso at ${ag.currentDestinationName}...`,
                `Relaxing at the plaza, unwinding after module sprint`,
                `Enjoying the city sunshine before returning to workstation`,
                `Sipping fresh espresso, ideating next software component`
              ];
              ag.thoughtBubble = breakThoughts[Math.floor(Math.random() * breakThoughts.length)];
              ag.speechTimer = 5.0;
            }
          }

          // When coffee break completes, head back to desk with a fresh procedural task!
          if (ag.routineTimer <= 0) {
            ag.routinePhase = 'DESK_WORK';
            ag.routineTimer = 22.0 + Math.random() * 8.0;
            ag.targetX = loc.desk.x;
            ag.targetZ = loc.desk.z;
            ag.currentDestinationName = loc.desk.name;
            ag.activeTask = ag.taskQueue.length > 0 
              ? ag.taskQueue.shift()! 
              : ProceduralSoftwareFactory.generateTask(ag.id, ag.name);
            ag.workProgress = 0;
            ag.currentTask = ag.activeTask.title;
            while (ag.taskQueue.length < 3) {
              ag.taskQueue.push(ProceduralSoftwareFactory.generateTask(ag.id, ag.name));
            }
            ag.thoughtBubble = `Back to desk: starting ${ag.activeTask.expectedDeliverable}`;
            ag.speechTimer = 5.0;
          }
          break;
        }

        case 'COLLABORATION': {
          ag.status = 'EVALUATING';
          ag.availability = 'ON_CALL';
          if (dist <= 0.4) {
            if (!ag.thoughtBubble || ag.speechTimer === undefined || ag.speechTimer <= 0) {
              const collabThoughts = [
                `Discussing API contracts with ${ag.currentDestinationName}...`,
                `Pair-reviewing architectural diffs and schema invariants`,
                `Aligning on error formats and high-throughput async queues`,
                `Collaborative whiteboard discussion: zero circular dependencies`
              ];
              ag.thoughtBubble = collabThoughts[Math.floor(Math.random() * collabThoughts.length)];
              ag.speechTimer = 5.0;
            }
          }

          if (ag.routineTimer <= 0) {
            ag.routinePhase = 'DESK_WORK';
            ag.routineTimer = 22.0 + Math.random() * 8.0;
            ag.targetX = loc.desk.x;
            ag.targetZ = loc.desk.z;
            ag.currentDestinationName = loc.desk.name;
            ag.activeTask = ag.taskQueue.length > 0 
              ? ag.taskQueue.shift()! 
              : ProceduralSoftwareFactory.generateTask(ag.id, ag.name);
            ag.workProgress = 0;
            ag.currentTask = ag.activeTask.title;
            while (ag.taskQueue.length < 3) {
              ag.taskQueue.push(ProceduralSoftwareFactory.generateTask(ag.id, ag.name));
            }
            ag.thoughtBubble = `Returning to workstation: ${ag.activeTask.expectedDeliverable}`;
            ag.speechTimer = 5.0;
          }
          break;
        }

        case 'TERRACE_THINKING': {
          ag.status = 'EVALUATING';
          ag.availability = 'ON_CALL';
          if (dist <= 0.4) {
            if (!ag.thoughtBubble || ag.speechTimer === undefined || ag.speechTimer <= 0) {
              const terraceThoughts = [
                `Reflecting on system architecture from ${loc.terrace.name}...`,
                `Thinking through SQLite WAL checkpoints and lock isolation`,
                `Taking in the city vista while mapping out next milestone`,
                `Deep architectural reflection on terrace: solving bottlenecks`
              ];
              ag.thoughtBubble = terraceThoughts[Math.floor(Math.random() * terraceThoughts.length)];
              ag.speechTimer = 5.0;
            }
          }

          if (ag.routineTimer <= 0) {
            ag.routinePhase = 'DESK_WORK';
            ag.routineTimer = 22.0 + Math.random() * 8.0;
            ag.targetX = loc.desk.x;
            ag.targetZ = loc.desk.z;
            ag.currentDestinationName = loc.desk.name;
            ag.activeTask = ag.taskQueue.length > 0 
              ? ag.taskQueue.shift()! 
              : ProceduralSoftwareFactory.generateTask(ag.id, ag.name);
            ag.workProgress = 0;
            ag.currentTask = ag.activeTask.title;
            while (ag.taskQueue.length < 3) {
              ag.taskQueue.push(ProceduralSoftwareFactory.generateTask(ag.id, ag.name));
            }
            ag.thoughtBubble = `Back to workstation: ${ag.activeTask.expectedDeliverable}`;
            ag.speechTimer = 5.0;
          }
          break;
        }
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

      // Head to domain workstation desk
      const loc = AGENT_LOCATIONS[ag.id];
      if (loc) {
        ag.targetX = loc.desk.x;
        ag.targetZ = loc.desk.z;
        ag.currentDestinationName = loc.desk.name;
      }
      ag.routinePhase = 'DESK_WORK';
      ag.routineTimer = 25.0;
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

    // Head towards domain workstation desk
    const loc = AGENT_LOCATIONS[ag.id];
    if (loc) {
      ag.targetX = loc.desk.x;
      ag.targetZ = loc.desk.z;
      ag.currentDestinationName = loc.desk.name;
    }
    ag.routinePhase = 'DESK_WORK';
    ag.routineTimer = 25.0;

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

    if (lower.includes('time') || lower.includes('clock') || lower.includes('what time')) {
      const now = new Date();
      replyText = `The current system time is ${now.toLocaleTimeString()} on ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Host environment clock is synchronized.`;
    } else if (lower.includes('functioning') || lower.includes('city status') || lower.includes('city well') || lower.includes('functioning well') || lower.includes('how is the city')) {
      replyText = `The city is functioning at high operational capacity! Metrics: Citizen Satisfaction: ${this.metrics.citizenSatisfaction.toFixed(1)}%, Power Grid: ${this.metrics.powerGridStatus}%, Water Grid: ${this.metrics.waterGridStatus}%, Traffic Congestion: ${this.metrics.trafficCongestion}%. Total population: ${this.metrics.population} citizens with ${this.incidents.length} active emergency incidents.`;
    } else if (lower.includes('3d presentation') || (lower.includes('presentation') && lower.includes('3d'))) {
      replyText = `Interactive 3D WebGL Presentation request acknowledged! I can synthesize a standalone Three.js presentation on your computer disk featuring rotating wireframe models, particle nebulae, orbital camera lerping, and frosted glass cards. Connecting to backend execution engine...`;
    } else if (lower.includes('website') || lower.includes('web app') || lower.includes('webpage') || lower.includes('landing page')) {
      replyText = `Modern Responsive Website request acknowledged! I will synthesize a complete responsive website on your computer filesystem with glassmorphic cards, live interactive calculators, and high-conversion UX. Connecting to backend execution engine...`;
    } else if (lower.includes('work') || lower.includes('start') || lower.includes('make') || lower.includes('build') || lower.includes('code') || lower.includes('fix') || lower.includes('execute')) {
      const res = this.directWorkCommand(agentId);
      replyText = `Direct work order received, Commander! I have initiated "${res.task.title}". Operational state switched to WORKING. Target deliverable: ${res.task.expectedDeliverable}.`;
    } else if (lower.includes('status') || lower.includes('doing') || lower.includes('progress') || lower.includes('objective') || lower.includes('where are you') || lower.includes('what are you')) {
      if (ag.activeTask) {
        replyText = `I am currently working on "${ag.activeTask.title}" (${ag.workProgress.toFixed(0)}% complete) at ${ag.currentDestinationName || ag.department}. Phase: ${ag.routinePhase || 'DESK_WORK'}. Deliverable: ${ag.activeTask.expectedDeliverable}. No active blockers.`;
      } else if (ag.routinePhase === 'COFFEE_BREAK') {
        replyText = `I just wrapped up my previous engineering deliverable and stepped over to ${ag.currentDestinationName || 'the plaza espresso kiosk'} for a short coffee break. I'll head back to my desk shortly to start the next module!`;
      } else if (ag.routinePhase === 'COLLABORATION') {
        replyText = `I'm over at ${ag.currentDestinationName || 'a colleague terrace'} syncing on API contracts and microservice interfaces. Returning to my workstation soon.`;
      } else if (ag.routinePhase === 'TERRACE_THINKING') {
        replyText = `I'm taking in the city air on ${ag.currentDestinationName || 'the observation terrace'}, thinking through database lock contention and async pipelines before my next coding sprint.`;
      } else {
        replyText = `I am currently at ${ag.currentDestinationName || ag.department}. Availability is ${ag.availability}. All toolchains ready. You can press [F] or ask me to start work anytime!`;
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
