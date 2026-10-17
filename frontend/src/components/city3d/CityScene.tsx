import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { 
  Building, 
  RoadSegment, 
  Intersection, 
  Vehicle, 
  Pedestrian, 
  Incident, 
  CameraMode, 
  OverlayMode,
  AgentCharacter,
  PlayerState 
} from '../../simulation/types';
import { WorkplaceArchitect } from './WorkplaceArchitect';
import { createHumanoid, animateHumanoid, ClothingStyle } from './HumanoidBuilder';
import { buildBoxes, rayToBoxes, stepMovement, TPV_MAX_DIST, TPV_MIN_DIST, WALK_SPEED } from './PlayerController';
import { buildStreetDetail, createAtmosphere, dressCity, getAsphaltMaterial, hourFor, loadCarFactory, tileUVs } from './CityDressing';
import { spawnPedestrians } from './CityLife';
import { batchStatic } from './StaticBatcher';

interface CitySceneProps {
  buildings: Building[];
  roads: RoadSegment[];
  intersections: Intersection[];
  vehicles: Vehicle[];
  pedestrians?: Pedestrian[];
  agentCharacters: AgentCharacter[];
  incidents: Incident[];
  simulationTime: number;
  cameraMode: CameraMode;
  overlayMode: OverlayMode;
  selectedEntityId: string | null;
  selectedAgentId: string | null;
  playerState: PlayerState;
  onUpdatePlayer: (update: Partial<PlayerState>) => void;
  onInteractWithAgent: (agentId: string) => void;
  onDirectWorkCommand: (agentId: string) => void;
  onOpenPublicMissions: () => void;
  onSelectEntity: (type: 'BUILDING' | 'VEHICLE' | 'AGENT', id: string) => void;
  onSelectCameraMode?: (mode: CameraMode) => void;
  onToggleJetFlight?: (piloting: boolean) => void;
}

export const CityScene: React.FC<CitySceneProps> = ({
  buildings,
  roads,
  intersections,
  vehicles,
  pedestrians = [],
  agentCharacters,
  incidents,
  simulationTime,
  cameraMode,
  overlayMode,
  selectedEntityId,
  selectedAgentId,
  playerState,
  onUpdatePlayer,
  onInteractWithAgent,
  onDirectWorkCommand,
  onOpenPublicMissions,
  onSelectEntity,
  onSelectCameraMode,
  onToggleJetFlight
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Mesh registries
  const buildingGroupMap = useRef<Map<string, THREE.Group>>(new Map());
  const vehicleGroupMap = useRef<Map<string, THREE.Group>>(new Map());
  const agentMeshMap = useRef<Map<string, THREE.Group>>(new Map());
  const agentThoughtMeshMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const roadMeshMap = useRef<Map<string, THREE.Mesh>>(new Map());

  // Lighting
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  // First-person physics & movement state (stored in ref for 60fps loop)
  const fpv = useRef({
    x: playerState.x,
    y: playerState.y,
    z: playerState.z,
    yaw: playerState.yaw,
    pitch: playerState.pitch,
    velocityY: 0,
    isGrounded: true,
    isPointerLocked: false,
    vx: 0,
    vz: 0,
    bodyYaw: playerState.yaw,   // where the avatar faces (turns toward the direction of travel)
    camDist: 4.2,               // third-person zoom (mouse wheel)
    camCurDist: 4.2,            // after camera collision, smoothed
    keys: {
      w: false,
      a: false,
      s: false,
      d: false,
      shift: false,
      space: false
    }
  });

  // Camera Orbit State (fallback mode)
  const orbitState = useRef({
    angleX: 0.85,
    angleY: 0.55,
    distance: 85,
    target: new THREE.Vector3(0, 0, 0),
    isDragging: false,
    prevX: 0,
    prevY: 0
  });

  // Supreme Governor Avatar & Private Jet Refs
  const governorRef = useRef<THREE.Group | null>(null);
  const jetRef = useRef<THREE.Group | null>(null);
  const jetState = useRef({
    x: 6.0,
    y: 0.6,
    z: 24.0,
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    speed: 0.0,
    throttle: 0.0,
    isPiloted: false
  });

  // Agent characters reference to prevent stale closure bugs in keyboard and physics loops
  const agentCharactersRef = useRef<AgentCharacter[]>(agentCharacters);
  useEffect(() => {
    agentCharactersRef.current = agentCharacters;
  }, [agentCharacters]);

  // The scene and render loop are created once; they read the latest camera mode and callbacks from refs.
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const cbRef = useRef({ onUpdatePlayer, onInteractWithAgent, onDirectWorkCommand, onOpenPublicMissions, onSelectCameraMode, onToggleJetFlight });
  cbRef.current = { onUpdatePlayer, onInteractWithAgent, onDirectWorkCommand, onOpenPublicMissions, onSelectCameraMode, onToggleJetFlight };

  // Keep jetState synced if toggled via external UI or HUD button
  useEffect(() => {
    if (playerState.isPilotingJet !== undefined && playerState.isPilotingJet !== jetState.current.isPiloted) {
      jetState.current.isPiloted = playerState.isPilotingJet;
      if (playerState.isPilotingJet) {
        jetState.current.speed = Math.max(15.0, (playerState.jetSpeed || 54) / 3.6);
      } else {
        jetState.current.speed = 0;
        jetState.current.throttle = 0;
        jetState.current.pitch = 0;
        jetState.current.roll = 0;
        fpv.current.x = jetState.current.x + 3.2;
        fpv.current.y = 1.85;
        fpv.current.z = jetState.current.z;
      }
    }
  }, [playerState.isPilotingJet, playerState.jetSpeed]);

  // Helper to create glowing signboard canvas texture for buildings
  const createSignboardTexture = (text: string, colorHex: string): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#060B18';
    ctx.fillRect(0, 0, 512, 128);

    ctx.lineWidth = 6;
    ctx.strokeStyle = colorHex;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 24, 8);
    ctx.fillRect(0, 0, 8, 24);
    ctx.fillRect(512 - 24, 0, 24, 8);
    ctx.fillRect(512 - 8, 0, 8, 24);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    return new THREE.CanvasTexture(canvas);
  };

  // Helper to create speech/thought bubble canvas texture for agents
  const createThoughtTexture = (text: string): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0F172ACC';
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(4, 4, 504, 120, 20);
      ctx.fill();
    } else {
      ctx.fillRect(4, 4, 504, 120);
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38BDF8';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.stroke();
    } else {
      ctx.strokeRect(4, 4, 504, 120);
    }

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 36), 256, 64);

    return new THREE.CanvasTexture(canvas);
  };

  // --- Supreme Governor 3D Avatar Builder ---
  const createSupremeGovernorAvatar = (): THREE.Group => {
    const root = new THREE.Group();
    root.name = 'SupremeGovernorAvatar';

    // Realistic rigged human figure in the Governor's coat and gold circlet (see HumanoidBuilder)
    const human = createHumanoid({ seed: 'supreme-governor', style: 'GOVERNOR', accentColor: '#F59E0B', skinColor: '#E0AC69', hairColor: '#1E1B18' });
    root.add(human);
    (root as any)._human = human;

    // 5. Overhead Floating 3D Billboard Banner
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(7, 11, 22, 0.90)';
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(10, 10, 492, 140, 24);
      ctx.fill();
    } else {
      ctx.fillRect(10, 10, 492, 140);
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#F59E0B';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.stroke();
    } else {
      ctx.strokeRect(10, 10, 492, 140);
    }

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👑 SUPREME GOVERNOR', 256, 68);

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('[ COMMANDER-IN-CHIEF ]', 256, 114);

    const texture = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), bannerMat);
    banner.position.y = 2.45;
    root.add(banner);

    (root as any)._billboard = banner;

    return root;
  };

  // --- Supreme Governor Sovereign-X1 Private Jet Builder ---
  const createSupremeGovernorJet = (): THREE.Group => {
    const root = new THREE.Group();
    root.name = 'SupremeGovernorPrivateJet';

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, metalness: 0.85, roughness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, metalness: 0.9, roughness: 0.15 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.75 });
    const glowCyan = new THREE.MeshBasicMaterial({ color: 0x38BDF8 });
    const thrusterFlameMat = new THREE.MeshBasicMaterial({ color: 0x00F0FF, transparent: true, opacity: 0.85 });

    // Fuselage (Facing forward along -Z)
    const fuselageGeo = new THREE.ConeGeometry(0.9, 7.5, 8);
    fuselageGeo.rotateX(-Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
    fuselage.position.set(0, 0.8, 0);
    fuselage.scale.set(1.1, 0.75, 1.0);
    fuselage.castShadow = true;
    root.add(fuselage);

    // Gold Nose Cone (Pointing forward to -Z)
    const noseConeGeo = new THREE.ConeGeometry(0.35, 1.6, 8);
    noseConeGeo.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseConeGeo, goldMat);
    nose.position.set(0, 0.8, -4.3);
    root.add(nose);

    // Cockpit Canopy Glass (Towards front)
    const canopyGeo = new THREE.CylinderGeometry(0.45, 0.6, 2.2, 8);
    canopyGeo.rotateX(Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeo, glassMat);
    canopy.position.set(0, 1.25, -1.6);
    canopy.scale.set(0.9, 0.65, 1.0);
    root.add(canopy);

    // Swept Delta Wings (BoxGeometry combination angled backward toward +Z)
    const wingGeo = new THREE.BoxGeometry(4.2, 0.12, 2.6);
    const rightWing = new THREE.Mesh(wingGeo, bodyMat);
    rightWing.position.set(2.4, 0.8, 0.6);
    rightWing.rotation.y = -0.35;
    rightWing.castShadow = true;
    root.add(rightWing);

    const leftWing = new THREE.Mesh(wingGeo, bodyMat);
    leftWing.position.set(-2.4, 0.8, 0.6);
    leftWing.rotation.y = 0.35;
    leftWing.castShadow = true;
    root.add(leftWing);

    // Gold Wing Trim Stripes
    const wingStripeGeo = new THREE.BoxGeometry(0.14, 0.05, 2.6);
    const rightStripe = new THREE.Mesh(wingStripeGeo, goldMat);
    rightStripe.position.set(2.4, 0.88, 0.6);
    rightStripe.rotation.y = -0.35;
    root.add(rightStripe);

    const leftStripe = new THREE.Mesh(wingStripeGeo, goldMat);
    leftStripe.position.set(-2.4, 0.88, 0.6);
    leftStripe.rotation.y = 0.35;
    root.add(leftStripe);

    // Wingtip Glowing Navigation Beacons
    const beaconGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const rightBeacon = new THREE.Mesh(beaconGeo, glowCyan);
    rightBeacon.position.set(4.35, 0.82, 1.8);
    root.add(rightBeacon);

    const leftBeacon = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: 0xF59E0B }));
    leftBeacon.position.set(-4.35, 0.82, 1.8);
    root.add(leftBeacon);

    // Twin Angled Vertical Stabilizers (Tailfins at rear +Z)
    const finGeo = new THREE.BoxGeometry(0.08, 1.4, 1.2);
    const rightFin = new THREE.Mesh(finGeo, bodyMat);
    rightFin.position.set(0.9, 1.6, 3.0);
    rightFin.rotation.z = -0.22;
    root.add(rightFin);

    const leftFin = new THREE.Mesh(finGeo, bodyMat);
    leftFin.position.set(-0.9, 1.6, 3.0);
    leftFin.rotation.z = 0.22;
    root.add(leftFin);

    // Twin Rear Supersonic Plasma Thruster Engines (At rear +Z)
    const thrusterGeo = new THREE.CylinderGeometry(0.38, 0.44, 2.0, 16);
    thrusterGeo.rotateX(Math.PI / 2);
    const rightThruster = new THREE.Mesh(thrusterGeo, bodyMat);
    rightThruster.position.set(0.65, 0.8, 3.2);
    root.add(rightThruster);

    const leftThruster = new THREE.Mesh(thrusterGeo, bodyMat);
    leftThruster.position.set(-0.65, 0.8, 3.2);
    root.add(leftThruster);

    // Animated Plasma Flame Cones (Shooting backward toward +Z)
    const flameGeo = new THREE.ConeGeometry(0.32, 1.8, 12);
    flameGeo.rotateX(Math.PI / 2);
    const rightFlame = new THREE.Mesh(flameGeo, thrusterFlameMat);
    rightFlame.position.set(0.65, 0.8, 4.8);
    root.add(rightFlame);

    const leftFlame = new THREE.Mesh(flameGeo, thrusterFlameMat);
    leftFlame.position.set(-0.65, 0.8, 4.8);
    root.add(leftFlame);

    // Landing Gear Wheels/Skids
    const skidMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.8 });
    const frontGear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), skidMat);
    frontGear.position.set(0, 0.3, -2.8);
    root.add(frontGear);
    const leftGear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), skidMat);
    leftGear.position.set(-1.2, 0.3, 1.0);
    root.add(leftGear);
    const rightGear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), skidMat);
    rightGear.position.set(1.2, 0.3, 1.0);
    root.add(rightGear);

    // Overhead Holographic Jet Label
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(7, 11, 22, 0.90)';
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(8, 8, 496, 124, 20);
      ctx.fill();
    } else {
      ctx.fillRect(8, 8, 496, 124);
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38BDF8';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.stroke();
    } else {
      ctx.strokeRect(8, 8, 496, 124);
    }

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✈️ SOVEREIGN-X1 PRIVATE JET', 256, 56);

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('[ PRESS G TO PILOT AIRCRAFT ]', 256, 102);

    const texture = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), bannerMat);
    banner.position.set(0, 3.2, 0);
    root.add(banner);

    (root as any)._rightFlame = rightFlame;
    (root as any)._leftFlame = leftFlame;
    (root as any)._billboard = banner;

    return root;
  };

  // --- Initial Scene Setup ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x7EC0EE); // Vibrant Daytime Sky Blue
    scene.fog = new THREE.FogExp2(0xBCE0F8, 0.0016); // Soft Atmospheric Daylight Fog

    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || Math.max(500, window.innerHeight - 65);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Natural Sunlight & Daylight Illumination (High Noon)
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.95); // Crisp daylight ambient
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0xE2E8F0, 0.75); // Azure sky to stone ground
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const sun = new THREE.DirectionalLight(0xFFFAF0, 2.2); // Warm bright sun
    sun.position.set(90, 140, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    scene.add(sun);
    sunLightRef.current = sun;

    // ?debug=1 exposes the scene/renderer for performance profiling from the console
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as any).__city = { scene, renderer, camera, sun, fpv: fpv.current, moveBoxes: () => moveBoxes, cameraBoxes: () => cameraBoxes };
    }

    // Physical sky + sun with a real day/night cycle (follows this computer's clock unless the phone's
    // Settings pick a fixed time of day)
    const atmosphere = createAtmosphere(scene, renderer, sun, ambient, hemi);
    const readTimeSetting = () => { try { return window.localStorage.getItem('cityai.timeOfDay') || 'live'; } catch { return 'live'; } };
    let timeSetting = readTimeSetting();
    atmosphere.setHour(hourFor(timeSetting));
    const onTimeSetting = () => { timeSetting = readTimeSetting(); atmosphere.setHour(hourFor(timeSetting)); };
    window.addEventListener('cityai:timeofday', onTimeSetting);
    const clockTimer = window.setInterval(() => { if (timeSetting === 'live') atmosphere.setHour(hourFor('live')); }, 60_000);

    // Ground outside the city blocks (blocks get concrete lots in buildStreetDetail)
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5E6B4C, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build Roads & Sidewalks in Clean Daytime Asphalt
    const sidewalkGroup = new THREE.Group();
    scene.add(sidewalkGroup);
    roads.forEach(r => {
      const dx = r.end[0] - r.start[0];
      const dz = r.end[1] - r.start[1];
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const midX = (r.start[0] + r.end[0]) / 2;
      const midZ = (r.start[1] + r.end[1]) / 2;

      const roadGeo = new THREE.PlaneGeometry(length, 5.2);
      tileUVs(roadGeo, length, 5.2, 6);
      const roadMesh = new THREE.Mesh(roadGeo, getAsphaltMaterial());
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -angle;
      roadMesh.position.set(midX, 0.02, midZ);
      roadMesh.receiveShadow = true;
      roadMesh.userData = { type: 'ROAD', id: r.id };
      scene.add(roadMesh);
      roadMeshMap.current.set(r.id, roadMesh);

      // Concrete Sidewalks in clean daylight stone
      const swMat = new THREE.MeshStandardMaterial({ color: 0xBDB8AE, roughness: 0.9 });
      [-3.1, 3.1].forEach(offY => {
        const swGeo = new THREE.BoxGeometry(length, 0.16, 1.3);
        const swMesh = new THREE.Mesh(swGeo, swMat);
        swMesh.rotation.y = -angle;
        const nx = -Math.sin(angle) * offY;
        const nz = Math.cos(angle) * offY;
        swMesh.position.set(midX + nx, 0.08, midZ + nz);
        swMesh.receiveShadow = true;
        sidewalkGroup.add(swMesh);
      });
    });

    batchStatic(sidewalkGroup);   // ~120 sidewalk slabs -> one mesh

    // Lane markings, zebra crossings and concrete block lots
    buildStreetDetail(scene, roads, intersections, buildings);

    // Build Specialized Character Workplaces & Living Urban Blocks
    buildings.forEach(b => {
      const bGroup = WorkplaceArchitect.buildWorkplace(b, createSignboardTexture);
      // merge the static, plain-coloured parts (rotating holograms keep their own meshes)
      batchStatic(bGroup, o => o.parent === bGroup && o.userData?.rotSpeed !== undefined);
      scene.add(bGroup);
      buildingGroupMap.current.set(b.id, bGroup);
    });

    // Supreme Governor Executive Runway & Jetway
    const runwayGeo = new THREE.PlaneGeometry(12, 60);
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0x0A0F1D, roughness: 0.7, metalness: 0.3 });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(6, 0.03, 24);
    runway.receiveShadow = true;
    scene.add(runway);

    // Glowing Runway Edge Strobes
    for (let rz = -28; rz <= 28; rz += 7) {
      const edgeLightL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00F0FF }));
      edgeLightL.position.set(6 - 5.8, 0.12, 24 + rz);
      scene.add(edgeLightL);
      const edgeLightR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xF59E0B }));
      edgeLightR.position.set(6 + 5.8, 0.12, 24 + rz);
      scene.add(edgeLightR);
    }

    // Build and add Supreme Governor Sovereign-X1 Private Jet
    const jetGroup = createSupremeGovernorJet();
    jetGroup.position.set(jetState.current.x, jetState.current.y, jetState.current.z);
    scene.add(jetGroup);
    jetRef.current = jetGroup;

    // Build and add Supreme Governor 3D Avatar
    const govGroup = createSupremeGovernorAvatar();
    govGroup.position.set(fpv.current.x, fpv.current.y - 1.85, fpv.current.z);
    scene.add(govGroup);
    governorRef.current = govGroup;

    // Background pedestrians on the sidewalks (scenery, not AI citizens)
    const life = spawnPedestrians(scene, roads, 28);

    // Collision volumes: the player is a 0.45 circle against footprints grown by 0.9 (same reach as the
    // old 1.35 padding); the third-person camera stops just outside the walls.
    const PLAYER_RADIUS = 0.45;
    const moveBoxes = buildBoxes(buildings, 0.9);
    const cameraBoxes = buildBoxes(buildings, 0.35);

    // Real buildings, street lights, traffic lights, district signs and car models load in the background;
    // their collision boxes join the player's and the camera's as soon as they arrive.
    let disposed = false;
    let disposeDressing: (() => void) | null = null;
    const keepClear = [
      { x: fpv.current.x, z: fpv.current.z, r: 4 },                        // spawn point
      ...[-6, 4, 14, 24, 34, 44, 54].map(z => ({ x: 6, z, r: 8 })),        // executive runway
    ];
    dressCity(scene, buildings, roads, intersections, keepClear).then(res => {
      if (disposed) { res.dispose(); return; }
      disposeDressing = res.dispose;
      for (const id of res.hiddenBuildingIds) {
        const g = buildingGroupMap.current.get(id);
        if (g) g.visible = false;
      }
      for (const b of res.obstacles) {
        moveBoxes.push({ ...b, minX: b.minX - 0.9, maxX: b.maxX + 0.9, minZ: b.minZ - 0.9, maxZ: b.maxZ + 0.9 });
        if (b.height > 4) cameraBoxes.push(b);
      }
    }).catch(err => console.warn('City dressing failed to load', err));

    loadCarFactory().then(makeCar => {
      if (disposed) return;
      vehicles.forEach((v, i) => {
        const g = vehicleGroupMap.current.get(v.id);
        if (!g) return;
        g.clear();
        g.add(makeCar(v, i));
      });
    }).catch(err => console.warn('Car models failed to load', err));

    // Mouse wheel: third-person zoom, or orbit distance in Orbit view
    const onWheel = (e: WheelEvent) => {
      const mode = cameraModeRef.current;
      if (mode === 'TPV' || mode === 'SHOULDER_CAM') {
        e.preventDefault();
        fpv.current.camDist = Math.max(TPV_MIN_DIST, Math.min(TPV_MAX_DIST, fpv.current.camDist * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
      } else if (mode === 'ORBIT') {
        e.preventDefault();
        orbitState.current.distance = Math.max(25, Math.min(180, orbitState.current.distance * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
      }
    };

    // Pointer Lock & Mouse Look Listeners (Works for both 1st Person, 3rd Person, and Flight)
    const onCanvasClick = () => {
      container.requestPointerLock();
    };

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === container;
      fpv.current.isPointerLocked = isLocked;
      cbRef.current.onUpdatePlayer({ isPointerLocked: isLocked });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (fpv.current.isPointerLocked) {
        const sensitivity = 0.0022;
        if (jetState.current.isPiloted) {
          // Responsive Flight Mouse Steering (Pitch & Yaw with subtle banking)
          jetState.current.yaw -= e.movementX * sensitivity * 0.9;
          jetState.current.pitch = Math.max(-0.65, Math.min(0.65, jetState.current.pitch - e.movementY * sensitivity * 0.7));
          jetState.current.roll = Math.max(-0.65, Math.min(0.65, jetState.current.roll - e.movementX * sensitivity * 1.4));
          fpv.current.yaw = jetState.current.yaw;
          fpv.current.pitch = jetState.current.pitch;
        } else {
          // On-Foot Mouse Look (FPV & 3rd Person TPV Spherical Orbit)
          fpv.current.yaw -= e.movementX * sensitivity;
          fpv.current.pitch = Math.max(-1.1, Math.min(1.1, fpv.current.pitch - e.movementY * sensitivity));
        }
      } else if (orbitState.current.isDragging && cameraModeRef.current === 'ORBIT') {
        // Fallback Orbit Drag
        const dx = e.clientX - orbitState.current.prevX;
        const dy = e.clientY - orbitState.current.prevY;
        orbitState.current.prevX = e.clientX;
        orbitState.current.prevY = e.clientY;
        orbitState.current.angleX -= dx * 0.005;
        orbitState.current.angleY = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, orbitState.current.angleY + dy * 0.005));
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!fpv.current.isPointerLocked && cameraModeRef.current === 'ORBIT' && e.button === 0) {
        orbitState.current.isDragging = true;
        orbitState.current.prevX = e.clientX;
        orbitState.current.prevY = e.clientY;
      }
    };

    const onMouseUp = () => {
      orbitState.current.isDragging = false;
    };

    // Keyboard WASD, Shift, Space, E, M, Esc Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      // Typing in the chat/task boxes must not drive the game (E/F/G/M shortcuts, WASD, jump).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'w') fpv.current.keys.w = true;
      if (k === 'a') fpv.current.keys.a = true;
      if (k === 's') fpv.current.keys.s = true;
      if (k === 'd') fpv.current.keys.d = true;
      if (e.key === 'Shift') fpv.current.keys.shift = true;
      if (e.key === ' ' || e.code === 'Space') {
        fpv.current.keys.space = true;
        if (!jetState.current.isPiloted && fpv.current.isGrounded) {
          fpv.current.velocityY = 6.8;
          fpv.current.isGrounded = false;
        }
      }

      // 'V' Key: Toggle between First-Person View [FPV] and Third-Person View [TPV]
      if (k === 'v') {
        if (cbRef.current.onSelectCameraMode) {
          if (jetState.current.isPiloted) {
            cbRef.current.onSelectCameraMode(cameraModeRef.current === 'JET_CHASE' ? 'JET_COCKPIT' : 'JET_CHASE');
          } else {
            if (cameraModeRef.current === 'FPV' || cameraModeRef.current === 'STREET_LEVEL') {
              cbRef.current.onSelectCameraMode('TPV');
            } else {
              cbRef.current.onSelectCameraMode('FPV');
            }
          }
        }
      }

      // 'G' Key: Board or Land the Sovereign-X1 Private Jet
      if (k === 'g') {
        if (jetState.current.isPiloted) {
          // Land the jet safely
          jetState.current.isPiloted = false;
          jetState.current.speed = 0;
          jetState.current.throttle = 0;
          jetState.current.pitch = 0;
          jetState.current.roll = 0;
          fpv.current.x = jetState.current.x + 3.2;
          fpv.current.y = 1.85;
          fpv.current.z = jetState.current.z;
          if (cbRef.current.onSelectCameraMode) cbRef.current.onSelectCameraMode('TPV');
          if (cbRef.current.onToggleJetFlight) cbRef.current.onToggleJetFlight(false);
          cbRef.current.onUpdatePlayer({ isPilotingJet: false, jetSpeed: 0, jetAltitude: 0 });
        } else {
          // Board the jet
          jetState.current.isPiloted = true;
          jetState.current.speed = 18.0;
          if (cbRef.current.onSelectCameraMode) cbRef.current.onSelectCameraMode('JET_CHASE');
          if (cbRef.current.onToggleJetFlight) cbRef.current.onToggleJetFlight(true);
          cbRef.current.onUpdatePlayer({ isPilotingJet: true, jetSpeed: 65, jetAltitude: Math.round(jetState.current.y) });
        }
      }

      // E (2-way comms) and F (work order) are handled once, in CityHUD; handling them here too sent
      // every work order twice.

      // 'M' Key: Open Public Missions
      if (k === 'm') {
        if (document.pointerLockElement) document.exitPointerLock();
        cbRef.current.onOpenPublicMissions();
      }

      // 'Escape' Key: release pointer lock
      if (e.key === 'Escape') {
        if (document.pointerLockElement) document.exitPointerLock();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w') fpv.current.keys.w = false;
      if (k === 'a') fpv.current.keys.a = false;
      if (k === 's') fpv.current.keys.s = false;
      if (k === 'd') fpv.current.keys.d = false;
      if (e.key === 'Shift') fpv.current.keys.shift = false;
      if (e.key === ' ' || e.code === 'Space') fpv.current.keys.space = false;
    };

    container.addEventListener('click', onCanvasClick);
    container.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 60 FPS Render & Physics Loop
    let animId: number;
    let lastLoopTime = performance.now();

    // Player position goes to React at most 10x/second, or at once when the nearby citizen changes.
    let lastPlayerSync = 0;
    let lastNearbyId: string | null | undefined;
    // Nearby citizen with hysteresis: lock on within NEAR_ENTER, keep until beyond NEAR_EXIT, and only switch
    // when another citizen is clearly closer, so the Comms prompt stays put while you stand next to someone.
    const NEAR_ENTER = 7.0, NEAR_EXIT = 10.0, NEAR_SWITCH_MARGIN = 1.5;
    let lockedNearbyId: string | null = null;
    const billboardQ = new THREE.Quaternion();
    const syncPlayer = (update: Partial<PlayerState>) => {
      const now = performance.now();
      if (now - lastPlayerSync < 100 && update.nearbyAgentId === lastNearbyId) return;
      lastPlayerSync = now;
      lastNearbyId = update.nearbyAgentId;
      cbRef.current.onUpdatePlayer(update);
    };

    const animate = (currentTime: number) => {
      animId = requestAnimationFrame(animate);
      // the first rAF timestamp can predate the setup time: never step backwards
      const dt = Math.max(0, Math.min((currentTime - lastLoopTime) / 1000.0, 0.1));
      lastLoopTime = currentTime;

      const p = fpv.current;
      const jet = jetState.current;

      // 1. Flight Dynamics or On-Foot Movement Physics
      if (jet.isPiloted) {
        // --- Sovereign-X1 Supersonic Private Jet Flight Physics ---
        if (p.keys.w) jet.speed = Math.min(45.0, jet.speed + 25.0 * dt); // Throttle up to 162 km/h
        else if (p.keys.s) jet.speed = Math.max(10.0, jet.speed - 22.0 * dt); // Airbrake down to 36 km/h
        else jet.speed = Math.max(16.0, jet.speed - 2.0 * dt); // Cruise speed ~58 km/h

        jet.throttle = Math.max(0.1, (jet.speed - 10.0) / 35.0);

        // Turn & Aerodynamic Roll Banking (A = Left, D = Right)
        if (p.keys.a) {
          jet.yaw += 1.8 * dt;
          jet.roll = Math.min(0.65, jet.roll + 3.0 * dt);
        } else if (p.keys.d) {
          jet.yaw -= 1.8 * dt;
          jet.roll = Math.max(-0.65, jet.roll - 3.0 * dt);
        } else {
          // Smooth auto-leveling wings return
          jet.roll *= Math.max(0, 1.0 - 5.0 * dt);
        }

        // Pitch (Space = Climb Up, Shift = Dive Down)
        if (p.keys.space) {
          jet.pitch = Math.min(0.65, jet.pitch + 1.4 * dt);
        } else if (p.keys.shift) {
          jet.pitch = Math.max(-0.65, jet.pitch - 1.4 * dt);
        } else {
          // Smooth pitch dampening towards horizontal flight
          jet.pitch *= Math.max(0, 1.0 - 2.5 * dt);
        }

        // Forward Velocity in 3D (Along true forward vector -Z)
        const forwardX = -Math.sin(jet.yaw) * Math.cos(jet.pitch);
        const forwardY = Math.sin(jet.pitch);
        const forwardZ = -Math.cos(jet.yaw) * Math.cos(jet.pitch);

        jet.x += forwardX * jet.speed * dt;
        jet.y += forwardY * jet.speed * dt;
        jet.z += forwardZ * jet.speed * dt;

        // Metropolis Airspace Boundary Enforcement (±118m)
        const CITY_BOUND = 118.0;
        if (Math.abs(jet.x) > 100 || Math.abs(jet.z) > 100) {
          const angleToCenter = Math.atan2(-jet.x, -jet.z);
          let diff = angleToCenter - jet.yaw;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          jet.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 2.2 * dt);
          jet.roll = -Math.sign(diff) * 0.45;
        }

        jet.x = Math.max(-CITY_BOUND, Math.min(CITY_BOUND, jet.x));
        jet.z = Math.max(-CITY_BOUND, Math.min(CITY_BOUND, jet.z));
        jet.y = Math.max(2.2, Math.min(140.0, jet.y));

        // Solid Building Obstacle Collisions for Aircraft (Deflection instead of walkthrough)
        buildings.forEach(b => {
          if (b.type === 'PARK_SPACE') return;
          const pad = 1.4;
          const minX = b.x - b.width / 2 - pad - 2.5;
          const maxX = b.x + b.width / 2 + pad + 2.5;
          const minZ = b.z - b.depth / 2 - pad - 2.5;
          const maxZ = b.z + b.depth / 2 + pad + 2.5;
          const bHeight = b.height + 2.5;

          if (jet.y < bHeight && jet.x >= minX && jet.x <= maxX && jet.z >= minZ && jet.z <= maxZ) {
            // Deflect jet outward
            const dx = jet.x - b.x;
            const dz = jet.z - b.z;
            const len = Math.hypot(dx, dz) || 1.0;
            jet.x += (dx / len) * 35.0 * dt;
            jet.z += (dz / len) * 35.0 * dt;
            jet.speed = Math.max(10.0, jet.speed * 0.55);
            jet.roll = -jet.roll;
          }
        });

        // Keep player coordinates synced
        p.x = jet.x;
        p.y = jet.y + 1.0;
        p.z = jet.z;
        p.yaw = jet.yaw;

        // Update Jet 3D Group (Facing along forward vector)
        if (jetRef.current) {
          const jg = jetRef.current;
          jg.position.set(jet.x, jet.y, jet.z);
          jg.rotation.set(jet.pitch, jet.yaw, jet.roll);

          // Animate Thruster Flames
          const flameScale = 0.8 + jet.throttle * 2.8;
          if ((jg as any)._rightFlame) (jg as any)._rightFlame.scale.set(1.0, 1.0, flameScale);
          if ((jg as any)._leftFlame) (jg as any)._leftFlame.scale.set(1.0, 1.0, flameScale);
        }

        // Place Supreme Governor in Jet Cockpit
        if (governorRef.current) {
          const gov = governorRef.current;
          gov.visible = true;
          gov.position.set(jet.x, jet.y + 0.35, jet.z - 0.4);
          gov.rotation.set(jet.pitch, jet.yaw, jet.roll);
          gov.scale.set(0.65, 0.65, 0.65);
        }

        syncPlayer({
          x: jet.x,
          y: jet.y,
          z: jet.z,
          yaw: jet.yaw,
          pitch: jet.pitch,
          isPilotingJet: true,
          nearbyAgentId: null,
          jetSpeed: Math.round(jet.speed * 3.6),
          jetAltitude: Math.round(jet.y),
          jetHeading: Math.round(((-jet.yaw * 180 / Math.PI) % 360 + 360) % 360)
        });

      } else {
        // --- Supreme Governor On-Foot Movement Physics ---
        if (cameraModeRef.current === 'FPV' || cameraModeRef.current === 'STREET_LEVEL' || cameraModeRef.current === 'SHOULDER_CAM' || cameraModeRef.current === 'TPV') {
          // Camera-relative movement with acceleration, body turning and sliding collisions
          const isFirstPerson = cameraModeRef.current === 'FPV' || cameraModeRef.current === 'STREET_LEVEL';
          const move = { x: p.x, z: p.z, y: p.y, vx: p.vx, vz: p.vz, bodyYaw: p.bodyYaw };
          const people = [...agentCharactersRef.current.map(ag => ({ x: ag.x, z: ag.z, r: 0.55 })), ...life.obstacles()];
          stepMovement(
            move,
            { forward: (p.keys.w ? 1 : 0) - (p.keys.s ? 1 : 0), right: (p.keys.d ? 1 : 0) - (p.keys.a ? 1 : 0), sprint: p.keys.shift },
            p.yaw, dt, moveBoxes, people, PLAYER_RADIUS, 118,
          );
          if (Number.isFinite(move.x) && Number.isFinite(move.z) && Number.isFinite(move.vx) && Number.isFinite(move.vz)) {
            p.x = move.x; p.z = move.z; p.vx = move.vx; p.vz = move.vz;
          } else {
            // never let a bad input poison the player position (keep the last good state)
            p.vx = 0; p.vz = 0;
          }
          // In first person the body always faces where you look; in third person it turns toward travel
          p.bodyYaw = isFirstPerson ? p.yaw : move.bodyYaw;

          // Jump & Gravity
          if (!p.isGrounded) {
            p.velocityY -= 18.0 * dt;
            p.y += p.velocityY * dt;
            if (p.y <= 1.85) {
              p.y = 1.85;
              p.velocityY = 0;
              p.isGrounded = true;
            }
          }

          // Nearby citizen (sticky, see NEAR_ENTER/NEAR_EXIT)
          let closestAgentDist = 999;
          let closestAgentId: string | null = null;
          let lockedDist = Infinity;
          agentCharactersRef.current.forEach(ag => {
            const d = Math.hypot(p.x - ag.x, p.z - ag.z);
            if (ag.id === lockedNearbyId) lockedDist = d;
            if (d < closestAgentDist) {
              closestAgentDist = d;
              closestAgentId = ag.id;
            }
          });
          if (lockedNearbyId) {
            if (lockedDist > NEAR_EXIT) lockedNearbyId = null;
            else if (closestAgentId !== lockedNearbyId && closestAgentDist + NEAR_SWITCH_MARGIN < lockedDist) lockedNearbyId = closestAgentId;
          }
          if (!lockedNearbyId && closestAgentDist <= NEAR_ENTER) lockedNearbyId = closestAgentId;
          const nearbyId = lockedNearbyId;

          // Sync player state with React
          syncPlayer({
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            pitch: p.pitch,
            isSprinting: p.keys.shift,
            isGrounded: p.isGrounded,
            isPilotingJet: false,
            jetSpeed: 0,
            jetAltitude: 0,
            nearbyAgentId: nearbyId,
            nearbyAgentDistance: closestAgentDist
          });
        }

        // Update Supreme Governor Avatar on foot
        if (governorRef.current) {
          const gov = governorRef.current;
          gov.scale.set(1.0, 1.0, 1.0);
          gov.position.set(p.x, p.y - 1.85, p.z);
          gov.rotation.set(0, p.bodyYaw + Math.PI, 0);

          // Hide avatar in first person view so own head does not block view; show in third person & orbit!
          gov.visible = (cameraModeRef.current !== 'FPV' && cameraModeRef.current !== 'STREET_LEVEL');

          // Walk / run cycle (only worth animating when the avatar is visible)
          const groundSpeed = Math.hypot(p.vx, p.vz);
          if (gov.visible && (gov as any)._human) {
            animateHumanoid((gov as any)._human, currentTime / 1000, dt, {
              moving: groundSpeed > 0.6,
              speed: groundSpeed > WALK_SPEED + 0.5 ? 1.8 : 1,
            });
          }
        }

        // Jet stays parked on executive runway
        if (jetRef.current) {
          const jg = jetRef.current;
          jg.position.set(jet.x, jet.y, jet.z);
          jg.rotation.set(0, jet.yaw, 0);
          if ((jg as any)._rightFlame) (jg as any)._rightFlame.scale.set(0.2, 0.2, 0.2);
          if ((jg as any)._leftFlame) (jg as any)._leftFlame.scale.set(0.2, 0.2, 0.2);
        }
      }

      // 2. Camera Positioning & View Modes (FPV, TPV, Jet Chase, Orbit)
      if (jet.isPiloted) {
        if (cameraModeRef.current === 'FPV' || cameraModeRef.current === 'JET_COCKPIT') {
          // Cockpit First-Person View inside the jet looking forward
          camera.position.set(jet.x, jet.y + 1.25, jet.z - 0.8);
          const lookDir = new THREE.Vector3(
            -Math.sin(jet.yaw) * Math.cos(jet.pitch),
            Math.sin(jet.pitch),
            -Math.cos(jet.yaw) * Math.cos(jet.pitch)
          );
          camera.lookAt(new THREE.Vector3().addVectors(camera.position, lookDir));
        } else {
          // Third-Person Jet Chase Cam (Behind and elevated along +Z offset)
          const back = 14.0;
          const camX = jet.x + Math.sin(jet.yaw) * back;
          const camY = jet.y + 4.2 - Math.sin(jet.pitch) * 3.5;
          const camZ = jet.z + Math.cos(jet.yaw) * back;
          camera.position.set(camX, camY, camZ);
          camera.lookAt(jet.x, jet.y + 0.5, jet.z);
        }
      } else {
        if (cameraModeRef.current === 'FPV' || cameraModeRef.current === 'STREET_LEVEL') {
          // First-Person Player View
          camera.position.set(p.x, p.y, p.z);
          const lookDir = new THREE.Vector3(
            -Math.sin(p.yaw) * Math.cos(p.pitch),
            Math.sin(p.pitch),
            -Math.cos(p.yaw) * Math.cos(p.pitch)
          );
          camera.lookAt(new THREE.Vector3().addVectors(camera.position, lookDir));

        } else if (cameraModeRef.current === 'SHOULDER_CAM' || cameraModeRef.current === 'TPV') {
          // Third-person orbit camera: mouse turns the camera around a pivot just over the right shoulder,
          // the wheel zooms, and the camera is pulled in (never through) when a building is in the way.
          const forwardDir = new THREE.Vector3(
            -Math.sin(p.yaw) * Math.cos(p.pitch),
            Math.sin(p.pitch),
            -Math.cos(p.yaw) * Math.cos(p.pitch)
          );
          const rightX = Math.cos(p.yaw);
          const rightZ = -Math.sin(p.yaw);
          const shoulder = 0.45 * Math.min(1, p.camCurDist / 4);
          const pivotX = p.x + rightX * shoulder;
          const pivotY = p.y + 0.15;
          const pivotZ = p.z + rightZ * shoulder;

          const hit = rayToBoxes(pivotX, pivotY, pivotZ, -forwardDir.x, -forwardDir.y, -forwardDir.z, p.camDist, cameraBoxes);
          const wanted = Math.max(0.6, Math.min(p.camDist, hit - 0.25));
          // pull in instantly (no clipping), ease back out smoothly
          p.camCurDist = wanted < p.camCurDist ? wanted : p.camCurDist + (wanted - p.camCurDist) * (1 - Math.exp(-dt * 6));

          const camX = pivotX - forwardDir.x * p.camCurDist;
          const camY = Math.max(0.4, pivotY - forwardDir.y * p.camCurDist);
          const camZ = pivotZ - forwardDir.z * p.camCurDist;
          camera.position.set(camX, camY, camZ);
          camera.lookAt(camX + forwardDir.x * 25.0, camY + forwardDir.y * 25.0, camZ + forwardDir.z * 25.0);

        } else if (cameraModeRef.current === 'TOP_DOWN') {
          camera.position.set(0, 130, 0.1);
          camera.lookAt(0, 0, 0);

        } else {
          // Drone Orbit View
          const st = orbitState.current;
          camera.position.x = st.target.x + st.distance * Math.sin(st.angleX) * Math.cos(st.angleY);
          camera.position.z = st.target.z + st.distance * Math.cos(st.angleX) * Math.cos(st.angleY);
          camera.position.y = st.target.y + st.distance * Math.sin(st.angleY);
          camera.lookAt(st.target);
        }
      }

      // Always rotate holographic banners to face camera. The parent (avatar, jet, citizen) is itself rotated,
      // so undo its world rotation first; copying the camera rotation directly mirrored the text.
      const faceCamera = (obj: THREE.Object3D) => {
        if (!obj.parent) return;
        obj.parent.getWorldQuaternion(billboardQ);
        obj.quaternion.copy(billboardQ.invert().multiply(camera.quaternion));
      };
      if (governorRef.current && (governorRef.current as any)._billboard) {
        const banner = (governorRef.current as any)._billboard as THREE.Object3D;
        // Your own banner would sit right in front of the camera in third-person view
        banner.visible = camera.position.distanceTo(governorRef.current.position) > 9;
        if (banner.visible) faceCamera(banner);
      }
      if (jetRef.current && (jetRef.current as any)._billboard) {
        faceCamera((jetRef.current as any)._billboard);
      }

      life.update(dt, currentTime / 1000, camera.position);

      // Traffic: cars follow the engine's vehicles every frame (they used to be placed once)
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        const vg = vehicleGroupMap.current.get(v.id);
        if (!vg) continue;
        vg.position.set(v.x, 0.05, v.z);
        vg.rotation.y = -v.angle;
      }

      // Citizens face the Governor when close and swing their limbs while walking
      const walkNow = Date.now();
      for (const ag of agentCharactersRef.current) {
        const aGroup = agentMeshMap.current.get(ag.id);
        if (!aGroup) continue;
        const dx = p.x - ag.x;
        const dz = p.z - ag.z;
        aGroup.rotation.y = Math.hypot(dx, dz) <= 4.2 ? Math.atan2(dx, dz) : Math.PI / 2 - ag.angle;
        const g = aGroup as any;
        if (g._human) {
          const near = Math.hypot(dx, dz) <= 4.2;
          const isMoving = Math.hypot(ag.x - ag.targetX, ag.z - ag.targetZ) > 0.4 || ag.status === 'TRAVELING';
          animateHumanoid(g._human, walkNow / 1000, dt, {
            moving: isMoving,
            speed: (ag.speed || 3.2) > 4.5 ? 1.6 : 1,
            talking: near,
            working: ag.status === 'WORKING' || ag.status === 'VERIFYING',
          });
        }
      }

      // Always rotate holographic citizen badges and thought bubbles to face the camera
      agentMeshMap.current.forEach((aGroup) => {
        // floating labels only near the camera (a city full of giant signs is not realistic)
        const near = aGroup.position.distanceTo(camera.position) < 30;
        const bb = (aGroup as any)._billboard;
        if (bb) { bb.visible = near; if (near) faceCamera(bb); }
        const tb = (aGroup as any)._thought;
        if (tb && tb.visible && !near) tb.visible = false;
        if (tb && tb.visible) faceCamera(tb);
      });

      // Animate dynamic holographic workplace features (rotating globes, diagnostic cores, data rings)
      buildingGroupMap.current.forEach((bGroup) => {
        bGroup.children.forEach((child) => {
          if (child.userData?.rotSpeed) {
            child.rotation.y += child.userData.rotSpeed * dt;
          }
        });
      });

      // The sun's shadow map is the most expensive pass and the city is static: refresh it every other
      // frame (moving people and cars still update their shadows 30 times a second).
      shadowFrame = (shadowFrame + 1) % 2;
      renderer.shadowMap.needsUpdate = shadowFrame === 0;
      renderer.render(scene, camera);
    };
    let shadowFrame = 0;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || window.innerWidth || 800;
      const h = container.clientHeight || Math.max(500, window.innerHeight - 65);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('click', onCanvasClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      disposed = true;
      if (disposeDressing) disposeDressing();
      window.removeEventListener('cityai:timeofday', onTimeSetting);
      window.clearInterval(clockTimer);
      life.dispose();
      atmosphere.dispose();
      agentMeshMap.current.clear();
      agentThoughtMeshMap.current.clear();
      vehicleGroupMap.current.clear();
      buildingGroupMap.current.clear();
      roadMeshMap.current.clear();
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach(m => {
          const map = (m as THREE.MeshBasicMaterial).map;
          if (map) map.dispose();
          m.dispose();
        });
      });
      sceneRef.current = null;
      renderer.dispose();
    };
  }, []);

  // --- Dynamic AI Agent Characters & Speech ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    agentCharacters.forEach(ag => {
      let aGroup = agentMeshMap.current.get(ag.id);
      if (!aGroup) {
        aGroup = new THREE.Group();
        aGroup.userData = { type: 'AGENT', id: ag.id };

        // Realistic rigged human figure (see HumanoidBuilder)
        const human = createHumanoid({
          seed: ag.id,
          style: (ag.clothingStyle || 'EXECUTIVE') as ClothingStyle,
          accentColor: ag.color,
          skinColor: ag.skinColor,
          hairColor: ag.hairColor,
        });
        aGroup.add(human);

        // 7. Glowing Base Status Ring
        const ringGeo = new THREE.RingGeometry(0.55, 0.7, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ag.status === 'WORKING' ? 0xF59E0B : 0x10B981,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        aGroup.add(ring);

        // 8. Overhead Holographic Badge showing Citizen Name + AI Model + Worker Role + Keys
        const tagCanvas = document.createElement('canvas');
        tagCanvas.width = 512; tagCanvas.height = 128;
        const tCtx = tagCanvas.getContext('2d')!;
        tCtx.fillStyle = '#060B18EE';
        tCtx.fillRect(4, 4, 504, 120);
        tCtx.lineWidth = 3;
        tCtx.strokeStyle = ag.aiModelBadgeColor || ag.color;
        tCtx.strokeRect(4, 4, 504, 120);

        // Citizen Name
        tCtx.fillStyle = '#FFFFFF';
        tCtx.font = 'bold 26px monospace';
        tCtx.textAlign = 'center';
        tCtx.fillText(`👤 ${ag.name}`, 256, 32);

        // AI Model & Provider
        tCtx.fillStyle = ag.aiModelBadgeColor || '#38BDF8';
        tCtx.font = 'bold 17px monospace';
        tCtx.fillText(`[${ag.aiProvider || 'AI'} • ${ag.aiModel || 'Worker Model'}]`, 256, 62);

        // Worker Role
        tCtx.fillStyle = ag.color;
        tCtx.font = 'bold 15px monospace';
        tCtx.fillText(ag.profession.slice(0, 34), 256, 88);

        // Action Key Hints
        tCtx.fillStyle = '#F59E0B';
        tCtx.font = 'bold 14px monospace';
        tCtx.fillText('[E] Talk  •  [T] Assign  •  [Q] Inspect', 256, 114);   // live status is in the HUD

        const tagTex = new THREE.CanvasTexture(tagCanvas);
        const tagMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 0.46),
          new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, side: THREE.DoubleSide })
        );
        tagMesh.position.y = 2.15;
        aGroup.add(tagMesh);

        // Thought Bubble
        const bubbleMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.3, 0.6),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        bubbleMesh.position.y = 2.65;
        aGroup.add(bubbleMesh);
        agentThoughtMeshMap.current.set(ag.id, bubbleMesh);

        // Scale up humanoid character for high visibility & heroic presence
        aGroup.scale.set(1.4, 1.4, 1.4);

        // Save limbs and billboard references for render loop
        (aGroup as any)._human = human;
        (aGroup as any)._statusRing = ring;
        (aGroup as any)._billboard = tagMesh;
        (aGroup as any)._thought = bubbleMesh;

        agentMeshMap.current.set(ag.id, aGroup);
      }

      // CRITICAL: Ensure attached to current active scene graph
      if (aGroup.parent !== scene) {
        scene.add(aGroup);
      }

      // Position and heading
      aGroup.position.set(ag.x, 0.05, ag.z);
      
      // Update ring color based on status
      const ring = (aGroup as any)._statusRing;
      if (ring) {
        ring.material.color.setHex(ag.status === 'WORKING' ? 0xF59E0B : 0x10B981);
      }

      // Update Thought Bubble
      const bMesh = agentThoughtMeshMap.current.get(ag.id);
      if (bMesh) {
        if (ag.thoughtBubble) {
          const mat = bMesh.material as THREE.MeshBasicMaterial;
          if (bMesh.userData.thoughtText !== ag.thoughtBubble) {
            if (mat.map) mat.map.dispose();
            mat.map = createThoughtTexture(ag.thoughtBubble);
            mat.opacity = 1.0;
            mat.needsUpdate = true;
            bMesh.userData.thoughtText = ag.thoughtBubble;
          }
          bMesh.visible = true;
        } else {
          bMesh.visible = false;
        }
      }
    });
  }, [agentCharacters]);

  // --- Dynamic Vehicles ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    vehicles.forEach(v => {
      let vGroup = vehicleGroupMap.current.get(v.id);
      if (!vGroup) {
        vGroup = new THREE.Group();
        vGroup.userData = { type: 'VEHICLE', id: v.id };

        const carGeo = new THREE.BoxGeometry(2.0, 0.7, 1.1);
        const carMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(v.color), roughness: 0.3 });
        const car = new THREE.Mesh(carGeo, carMat);
        car.position.y = 0.42;
        vGroup.add(car);

        vehicleGroupMap.current.set(v.id, vGroup);
      }

      // CRITICAL: Ensure attached to current active scene graph
      if (vGroup.parent !== scene) {
        scene.add(vGroup);
      }

      vGroup.position.set(v.x, 0.05, v.z);
      vGroup.rotation.y = -v.angle;
    });
  }, [vehicles]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={mountRef} 
        className="w-full h-full cursor-crosshair active:cursor-crosshair"
      />
    </div>
  );
};
