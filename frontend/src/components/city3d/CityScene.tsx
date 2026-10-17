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

    const coatMat = new THREE.MeshStandardMaterial({ color: 0x090D18, roughness: 0.35, metalness: 0.25 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, metalness: 0.88, roughness: 0.2 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
    const bootsMat = new THREE.MeshStandardMaterial({ color: 0x030712, roughness: 0.4, metalness: 0.3 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xE0AC69, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1E1B18, roughness: 0.7 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8 });
    const crestMat = new THREE.MeshBasicMaterial({ color: 0xF59E0B });

    // 1. Articulated Legs
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.16, 0.75, 0);
    const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), pantsMat);
    leftThigh.position.y = -0.21;
    leftThigh.castShadow = true;
    leftLeg.add(leftThigh);
    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.28), bootsMat);
    leftBoot.position.set(0, -0.44, 0.04);
    leftBoot.castShadow = true;
    leftLeg.add(leftBoot);
    const leftGoldBand = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.20), goldTrimMat);
    leftGoldBand.position.y = -0.36;
    leftLeg.add(leftGoldBand);
    root.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.16, 0.75, 0);
    const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), pantsMat);
    rightThigh.position.y = -0.21;
    rightThigh.castShadow = true;
    rightLeg.add(rightThigh);
    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.28), bootsMat);
    rightBoot.position.set(0, -0.44, 0.04);
    rightBoot.castShadow = true;
    rightLeg.add(rightBoot);
    const rightGoldBand = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.20), goldTrimMat);
    rightGoldBand.position.y = -0.36;
    rightLeg.add(rightGoldBand);
    root.add(rightLeg);

    // 2. Torso & Executive Trenchcoat
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.64, 0.32), coatMat);
    torso.position.y = 1.10;
    torso.castShadow = true;
    root.add(torso);

    // Gold Trim Epaulettes on Shoulders
    const epauletteGeo = new THREE.BoxGeometry(0.18, 0.06, 0.34);
    const leftEpaulette = new THREE.Mesh(epauletteGeo, goldTrimMat);
    leftEpaulette.position.set(-0.31, 1.40, 0);
    root.add(leftEpaulette);
    const rightEpaulette = new THREE.Mesh(epauletteGeo, goldTrimMat);
    rightEpaulette.position.set(0.31, 1.40, 0);
    root.add(rightEpaulette);

    // Longcoat Mantle Flaps hanging down
    const coatTail = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.42, 0.12), coatMat);
    coatTail.position.set(0, 0.68, -0.12);
    root.add(coatTail);

    // Chest Glowing Governor Gorget / Core
    const crestGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16);
    crestGeo.rotateX(Math.PI / 2);
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.set(0, 1.25, 0.18);
    root.add(crest);

    // 3. Articulated Arms
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.35, 1.34, 0);
    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.15), coatMat);
    leftSleeve.position.y = -0.21;
    leftArm.add(leftSleeve);
    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), goldTrimMat);
    leftGlove.position.y = -0.44;
    leftArm.add(leftGlove);
    root.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.35, 1.34, 0);
    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.15), coatMat);
    rightSleeve.position.y = -0.21;
    rightArm.add(rightSleeve);
    const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), goldTrimMat);
    rightGlove.position.y = -0.44;
    rightArm.add(rightGlove);
    root.add(rightArm);

    // 4. Head, Crown & Visor
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 0.28), skinMat);
    head.position.y = 1.62;
    root.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.30), hairMat);
    hair.position.set(0, 1.78, 0);
    root.add(hair);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.12), visorMat);
    visor.position.set(0, 1.64, 0.12);
    root.add(visor);

    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.32), goldTrimMat);
    crown.position.set(0, 1.76, 0);
    root.add(crown);

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

    (root as any)._leftLeg = leftLeg;
    (root as any)._rightLeg = rightLeg;
    (root as any)._leftArm = leftArm;
    (root as any)._rightArm = rightArm;
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

    // Ground Plate in Clean Daylight Pavement
    const groundGeo = new THREE.PlaneGeometry(280, 280);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.85, metalness: 0.05 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(280, 56, 0x64748B, 0xCBD5E1);
    grid.position.y = -0.02;
    scene.add(grid);

    // Metropolis Airspace & City Boundary Pylons at ±120m
    const pylonMat = new THREE.MeshBasicMaterial({ color: 0x00F0FF });
    for (let bx = -120; bx <= 120; bx += 24) {
      [-120, 120].forEach(bz => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18), pylonMat);
        pylon.position.set(bx, 9, bz);
        scene.add(pylon);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38BDF8 }));
        beacon.position.set(bx, 18, bz);
        scene.add(beacon);
      });
    }
    for (let bz = -120; bz <= 120; bz += 24) {
      [-120, 120].forEach(bx => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18), pylonMat);
        pylon.position.set(bx, 9, bz);
        scene.add(pylon);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38BDF8 }));
        beacon.position.set(bx, 18, bz);
        scene.add(beacon);
      });
    }

    // Build Roads & Sidewalks in Clean Daytime Asphalt
    roads.forEach(r => {
      const dx = r.end[0] - r.start[0];
      const dz = r.end[1] - r.start[1];
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const midX = (r.start[0] + r.end[0]) / 2;
      const midZ = (r.start[1] + r.end[1]) / 2;

      const roadGeo = new THREE.PlaneGeometry(length, 5.2);
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.75 });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -angle;
      roadMesh.position.set(midX, 0.02, midZ);
      roadMesh.receiveShadow = true;
      roadMesh.userData = { type: 'ROAD', id: r.id };
      scene.add(roadMesh);
      roadMeshMap.current.set(r.id, roadMesh);

      // Center Line (Bright White)
      const lineGeo = new THREE.PlaneGeometry(length * 0.95, 0.22);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = -angle;
      line.position.set(midX, 0.03, midZ);
      scene.add(line);

      // Concrete Sidewalks in clean daylight stone
      const swMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.8 });
      [-3.1, 3.1].forEach(offY => {
        const swGeo = new THREE.BoxGeometry(length, 0.16, 1.3);
        const swMesh = new THREE.Mesh(swGeo, swMat);
        swMesh.rotation.y = -angle;
        const nx = -Math.sin(angle) * offY;
        const nz = Math.cos(angle) * offY;
        swMesh.position.set(midX + nx, 0.08, midZ + nz);
        swMesh.receiveShadow = true;
        scene.add(swMesh);
      });
    });

    // Build Specialized Character Workplaces & Living Urban Blocks
    buildings.forEach(b => {
      const bGroup = WorkplaceArchitect.buildWorkplace(b, createSignboardTexture);
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

    // Pointer Lock & Mouse Look Listeners (Works for both 1st Person, 3rd Person, and Flight)
    const onCanvasClick = () => {
      container.requestPointerLock();
    };

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === container;
      fpv.current.isPointerLocked = isLocked;
      onUpdatePlayer({ isPointerLocked: isLocked });
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
      } else if (orbitState.current.isDragging && cameraMode === 'ORBIT') {
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
      if (!fpv.current.isPointerLocked && cameraMode === 'ORBIT' && e.button === 0) {
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
        if (onSelectCameraMode) {
          if (jetState.current.isPiloted) {
            onSelectCameraMode(cameraMode === 'JET_CHASE' ? 'JET_COCKPIT' : 'JET_CHASE');
          } else {
            if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL') {
              onSelectCameraMode('TPV');
            } else {
              onSelectCameraMode('FPV');
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
          if (onSelectCameraMode) onSelectCameraMode('TPV');
          if (onToggleJetFlight) onToggleJetFlight(false);
          onUpdatePlayer({ isPilotingJet: false, jetSpeed: 0, jetAltitude: 0 });
        } else {
          // Board the jet
          jetState.current.isPiloted = true;
          jetState.current.speed = 18.0;
          if (onSelectCameraMode) onSelectCameraMode('JET_CHASE');
          if (onToggleJetFlight) onToggleJetFlight(true);
          onUpdatePlayer({ isPilotingJet: true, jetSpeed: 65, jetAltitude: Math.round(jetState.current.y) });
        }
      }

      // 'E' Key: Interact with nearby citizen (open 2-way comms) - Fresh Ref Lookup (Never Stale)
      if (k === 'e') {
        let closestAgent: AgentCharacter | null = null;
        let minDist = 999;
        for (const ag of agentCharactersRef.current) {
          const d = Math.hypot(fpv.current.x - ag.x, fpv.current.z - ag.z);
          if (d < minDist) {
            minDist = d;
            closestAgent = ag;
          }
        }

        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch (_) {}
        }

        if (closestAgent) {
          onInteractWithAgent(closestAgent.id);
        } else if (agentCharactersRef.current.length > 0) {
          onInteractWithAgent(agentCharactersRef.current[0].id);
        }
      }

      // 'F' Key: Direct Work Command (Make citizen work immediately)
      if (k === 'f') {
        let closestAgent: AgentCharacter | null = null;
        let minDist = 999;
        for (const ag of agentCharactersRef.current) {
          const d = Math.hypot(fpv.current.x - ag.x, fpv.current.z - ag.z);
          if (d < minDist) {
            minDist = d;
            closestAgent = ag;
          }
        }
        if (closestAgent) {
          onDirectWorkCommand(closestAgent.id);
        } else if (agentCharactersRef.current.length > 0) {
          onDirectWorkCommand(agentCharactersRef.current[0].id);
        }
      }

      // 'M' Key: Open Public Missions
      if (k === 'm') {
        if (document.pointerLockElement) document.exitPointerLock();
        onOpenPublicMissions();
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
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 60 FPS Render & Physics Loop
    let animId: number;
    let lastLoopTime = performance.now();

    const animate = (currentTime: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((currentTime - lastLoopTime) / 1000.0, 0.1);
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

        onUpdatePlayer({
          x: jet.x,
          y: jet.y,
          z: jet.z,
          yaw: jet.yaw,
          pitch: jet.pitch,
          isPilotingJet: true,
          jetSpeed: Math.round(jet.speed * 3.6),
          jetAltitude: Math.round(jet.y),
          jetHeading: Math.round(((-jet.yaw * 180 / Math.PI) % 360 + 360) % 360)
        });

      } else {
        // --- Supreme Governor On-Foot Movement Physics ---
        if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL' || cameraMode === 'SHOULDER_CAM' || cameraMode === 'TPV') {
          const moveSpeed = (p.keys.shift ? 10.5 : 5.8) * dt;
          let moveX = 0;
          let moveZ = 0;

          const forwardX = -Math.sin(p.yaw);
          const forwardZ = -Math.cos(p.yaw);
          const rightX = Math.cos(p.yaw);
          const rightZ = -Math.sin(p.yaw);

          if (p.keys.w) { moveX += forwardX; moveZ += forwardZ; }
          if (p.keys.s) { moveX -= forwardX; moveZ -= forwardZ; }
          if (p.keys.d) { moveX += rightX; moveZ += rightZ; }
          if (p.keys.a) { moveX -= rightX; moveZ -= rightZ; }

          const moveLen = Math.hypot(moveX, moveZ);
          if (moveLen > 0.001) {
            const proposedX = p.x + (moveX / moveLen) * moveSpeed;
            const proposedZ = p.z + (moveZ / moveLen) * moveSpeed;

            // Robust Collision Detection against Solid Buildings (including annexes)
            let collidesX = false;
            let collidesZ = false;

            for (let i = 0; i < buildings.length; i++) {
              const b = buildings[i];
              if (b.type === 'PARK_SPACE') continue;

              const pad = 1.35;
              const minX = b.x - b.width / 2 - pad;
              const maxX = b.x + b.width / 2 + pad;
              const minZ = b.z - b.depth / 2 - pad;
              const maxZ = b.z + b.depth / 2 + pad;
              const bHeight = b.height + 2.5;

              if (p.y < bHeight) {
                if (proposedX >= minX && proposedX <= maxX && p.z >= minZ && p.z <= maxZ) {
                  collidesX = true;
                }
                if (p.x >= minX && p.x <= maxX && proposedZ >= minZ && proposedZ <= maxZ) {
                  collidesZ = true;
                }
              }
            }

            const CITY_BOUND = 118.0;
            if (!collidesX && Math.abs(proposedX) < CITY_BOUND) p.x = proposedX;
            if (!collidesZ && Math.abs(proposedZ) < CITY_BOUND) p.z = proposedZ;
          }

          // Anti-Stuck Ejection from Building Footprints
          buildings.forEach(b => {
            if (b.type === 'PARK_SPACE') return;
            const pad = 1.35;
            const minX = b.x - b.width / 2 - pad;
            const maxX = b.x + b.width / 2 + pad;
            const minZ = b.z - b.depth / 2 - pad;
            const maxZ = b.z + b.depth / 2 + pad;
            if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ && p.y < b.height + 2) {
              const distL = Math.abs(p.x - minX);
              const distR = Math.abs(maxX - p.x);
              const distT = Math.abs(p.z - minZ);
              const distB = Math.abs(maxZ - p.z);
              const minD = Math.min(distL, distR, distT, distB);
              if (minD === distL) p.x = minX - 0.25;
              else if (minD === distR) p.x = maxX + 0.25;
              else if (minD === distT) p.z = minZ - 0.25;
              else p.z = maxZ + 0.25;
            }
          });

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

          // Compute nearby agent dynamically every frame
          let closestAgentDist = 999;
          let closestAgentId: string | null = null;
          agentCharactersRef.current.forEach(ag => {
            const d = Math.hypot(p.x - ag.x, p.z - ag.z);
            if (d < closestAgentDist) {
              closestAgentDist = d;
              closestAgentId = ag.id;
            }
          });
          const nearbyId = closestAgentDist <= 8.5 ? closestAgentId : null;

          // Sync player state with React
          onUpdatePlayer({
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
          gov.rotation.set(0, p.yaw + Math.PI, 0);

          // Hide avatar in first person view so own head does not block view; show in third person & orbit!
          gov.visible = (cameraMode !== 'FPV' && cameraMode !== 'STREET_LEVEL');

          // Walking leg & arm swing animations
          const isMoving = p.keys.w || p.keys.s || p.keys.a || p.keys.d;
          const swing = isMoving ? Math.sin(currentTime * 0.012) * 0.45 : 0;
          if ((gov as any)._leftLeg) (gov as any)._leftLeg.rotation.x = swing;
          if ((gov as any)._rightLeg) (gov as any)._rightLeg.rotation.x = -swing;
          if ((gov as any)._leftArm) (gov as any)._leftArm.rotation.x = -swing * 0.8;
          if ((gov as any)._rightArm) (gov as any)._rightArm.rotation.x = swing * 0.8;
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
        if (cameraMode === 'FPV' || cameraMode === 'JET_COCKPIT') {
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
        if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL') {
          // First-Person Player View
          camera.position.set(p.x, p.y, p.z);
          const lookDir = new THREE.Vector3(
            -Math.sin(p.yaw) * Math.cos(p.pitch),
            Math.sin(p.pitch),
            -Math.cos(p.yaw) * Math.cos(p.pitch)
          );
          camera.lookAt(new THREE.Vector3().addVectors(camera.position, lookDir));

        } else if (cameraMode === 'SHOULDER_CAM' || cameraMode === 'TPV') {
          // Third-Person Over-the-Shoulder View (100% Synchronized with FPV Orientation)
          const forwardDir = new THREE.Vector3(
            -Math.sin(p.yaw) * Math.cos(p.pitch),
            Math.sin(p.pitch),
            -Math.cos(p.yaw) * Math.cos(p.pitch)
          );

          // Right shoulder lateral offset so avatar does not block the crosshair reticle
          const rightX = Math.cos(p.yaw);
          const rightZ = -Math.sin(p.yaw);
          const shoulderSide = 0.55;

          const backDist = 3.6;
          const eyeHeight = 0.25;

          // Camera placed behind along -forwardDir (when mouse moves DOWN, pitch < 0, cam elevates to look down)
          const camX = p.x + rightX * shoulderSide - forwardDir.x * backDist;
          const camY = Math.max(0.45, p.y + eyeHeight - forwardDir.y * backDist);
          const camZ = p.z + rightZ * shoulderSide - forwardDir.z * backDist;

          camera.position.set(camX, camY, camZ);

          // Look 25 meters ahead along the exact forwardDir vector (100% synchronized with FPV)
          const lookTarget = new THREE.Vector3(
            camX + forwardDir.x * 25.0,
            camY + forwardDir.y * 25.0,
            camZ + forwardDir.z * 25.0
          );
          camera.lookAt(lookTarget);

        } else if (cameraMode === 'TOP_DOWN') {
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

      // Always rotate holographic banners to face camera
      if (governorRef.current && (governorRef.current as any)._billboard) {
        (governorRef.current as any)._billboard.quaternion.copy(camera.quaternion);
      }
      if (jetRef.current && (jetRef.current as any)._billboard) {
        (jetRef.current as any)._billboard.quaternion.copy(camera.quaternion);
      }

      // Always rotate holographic citizen badges and thought bubbles to face the camera
      agentMeshMap.current.forEach((aGroup) => {
        const bb = (aGroup as any)._billboard;
        if (bb) bb.quaternion.copy(camera.quaternion);
        const tb = (aGroup as any)._thought;
        if (tb && tb.visible) tb.quaternion.copy(camera.quaternion);
      });

      // Animate dynamic holographic workplace features (rotating globes, diagnostic cores, data rings)
      buildingGroupMap.current.forEach((bGroup) => {
        bGroup.children.forEach((child) => {
          if (child.userData?.rotSpeed) {
            child.rotation.y += child.userData.rotSpeed * dt;
          }
        });
      });

      renderer.render(scene, camera);
    };
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      agentMeshMap.current.clear();
      agentThoughtMeshMap.current.clear();
      vehicleGroupMap.current.clear();
      buildingGroupMap.current.clear();
      roadMeshMap.current.clear();
      sceneRef.current = null;
      renderer.dispose();
    };
  }, [cameraMode]);

  // --- Dynamic AI Agent Characters & Speech ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    agentCharacters.forEach(ag => {
      let aGroup = agentMeshMap.current.get(ag.id);
      if (!aGroup) {
        aGroup = new THREE.Group();
        aGroup.userData = { type: 'AGENT', id: ag.id };

        const skinColorHex = ag.skinColor || '#E0AC69';
        const hairColorHex = ag.hairColor || '#2D251E';

        const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinColorHex), roughness: 0.6 });
        const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hairColorHex), roughness: 0.8 });

        // 1. Role Clothing Palette
        let jacketColor = new THREE.Color(ag.color);
        let pantsColor = new THREE.Color('#1E293B');
        let shoesColor = new THREE.Color('#0F172A');

        if (ag.clothingStyle === 'CONSTRUCTION') {
          jacketColor = new THREE.Color('#EA580C'); // Safety Orange
          pantsColor = new THREE.Color('#1D4ED8'); // Blue denim
          shoesColor = new THREE.Color('#B45309'); // Workboots
        } else if (ag.clothingStyle === 'DOCTOR') {
          jacketColor = new THREE.Color('#FFFFFF'); // White Lab Coat
          pantsColor = new THREE.Color('#0F172A'); // Dark slacks
          shoesColor = new THREE.Color('#334155');
        } else if (ag.clothingStyle === 'ARCHITECT') {
          jacketColor = new THREE.Color('#1E3A8A'); // Navy blazer
          pantsColor = new THREE.Color('#475569'); // Slate trousers
          shoesColor = new THREE.Color('#1E293B');
        } else if (ag.clothingStyle === 'ENGINEER') {
          jacketColor = new THREE.Color('#27272A'); // Developer hoodie
          pantsColor = new THREE.Color('#18181B'); // Black jeans
          shoesColor = new THREE.Color('#F59E0B'); // Orange sneakers
        } else if (ag.clothingStyle === 'SECURITY') {
          jacketColor = new THREE.Color('#18181B'); // Tactical enforcement
          pantsColor = new THREE.Color('#09090B');
          shoesColor = new THREE.Color('#000000'); // Combat boots
        } else if (ag.clothingStyle === 'DEVOPS') {
          jacketColor = new THREE.Color('#0891B2'); // Cyan SRE windbreaker
          pantsColor = new THREE.Color('#334155');
          shoesColor = new THREE.Color('#0E7490');
        } else if (ag.clothingStyle === 'EXECUTIVE') {
          jacketColor = new THREE.Color('#0F172A'); // Command Trench Coat
          pantsColor = new THREE.Color('#1E293B');
          shoesColor = new THREE.Color('#000000');
        }

        const jacketMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.4 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.5 });
        const shoesMat = new THREE.MeshStandardMaterial({ color: shoesColor, roughness: 0.7 });

        // 2. Articulated Legs
        // Left Leg
        const leftLegGroup = new THREE.Group();
        leftLegGroup.position.set(-0.14, 0.72, 0);
        const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.40, 0.16), pantsMat);
        leftThigh.position.y = -0.18;
        leftLegGroup.add(leftThigh);
        const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.26), shoesMat);
        leftFoot.position.set(0, -0.42, 0.04);
        leftLegGroup.add(leftFoot);
        aGroup.add(leftLegGroup);

        // Right Leg
        const rightLegGroup = new THREE.Group();
        rightLegGroup.position.set(0.14, 0.72, 0);
        const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.40, 0.16), pantsMat);
        rightThigh.position.y = -0.18;
        rightLegGroup.add(rightThigh);
        const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.26), shoesMat);
        rightFoot.position.set(0, -0.42, 0.04);
        rightLegGroup.add(rightFoot);
        aGroup.add(rightLegGroup);

        // 3. Human Torso & Uniform
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.60, 0.28), jacketMat);
        torso.position.y = 1.05;
        torso.castShadow = true;
        aGroup.add(torso);

        // Construction Reflective Stripes
        if (ag.clothingStyle === 'CONSTRUCTION') {
          const stripeGeo = new THREE.BoxGeometry(0.49, 0.06, 0.29);
          const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE2E8F0 });
          const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
          stripe1.position.y = 1.10;
          aGroup.add(stripe1);
          const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
          stripe2.position.y = 0.95;
          aGroup.add(stripe2);
        } else if (ag.clothingStyle === 'DOCTOR') {
          // Stethoscope
          const stethGeo = new THREE.TorusGeometry(0.14, 0.018, 8, 16, Math.PI * 1.3);
          const stethMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
          const steth = new THREE.Mesh(stethGeo, stethMat);
          steth.position.set(0, 1.25, 0.14);
          steth.rotation.x = Math.PI / 4;
          aGroup.add(steth);
        }

        // 4. Articulated Arms & Hands
        // Left Arm
        const leftArmGroup = new THREE.Group();
        leftArmGroup.position.set(-0.31, 1.28, 0);
        const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.13), jacketMat);
        leftSleeve.position.y = -0.18;
        leftArmGroup.add(leftSleeve);
        const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
        leftHand.position.y = -0.40;
        leftArmGroup.add(leftHand);
        aGroup.add(leftArmGroup);

        // Right Arm
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(0.31, 1.28, 0);
        const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.13), jacketMat);
        rightSleeve.position.y = -0.18;
        rightArmGroup.add(rightSleeve);
        const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
        rightHand.position.y = -0.40;
        rightArmGroup.add(rightHand);
        aGroup.add(rightArmGroup);

        // 5. Neck & Head with Expressive Face & Realistic Hair
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.14, 8), skinMat);
        neck.position.y = 1.38;
        aGroup.add(neck);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 16), skinMat);
        head.position.y = 1.54;
        head.castShadow = true;
        aGroup.add(head);

        // Eyes (Sclera + Iris + Pupil)
        const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const pupilGeo = new THREE.SphereGeometry(0.012, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
        const irisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ag.color) });

        // Left Eye
        const leftEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
        leftEye.position.set(-0.065, 1.56, 0.18);
        const leftIris = new THREE.Mesh(pupilGeo, irisMat);
        leftIris.position.set(-0.065, 1.56, 0.195);
        const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), pupilMat);
        leftPupil.position.set(-0.065, 1.56, 0.203);
        aGroup.add(leftEye);
        aGroup.add(leftIris);
        aGroup.add(leftPupil);

        // Right Eye
        const rightEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
        rightEye.position.set(0.065, 1.56, 0.18);
        const rightIris = new THREE.Mesh(pupilGeo, irisMat);
        rightIris.position.set(0.065, 1.56, 0.195);
        const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), pupilMat);
        rightPupil.position.set(0.065, 1.56, 0.203);
        aGroup.add(rightEye);
        aGroup.add(rightIris);
        aGroup.add(rightPupil);

        // Eyebrows
        const browGeo = new THREE.BoxGeometry(0.045, 0.012, 0.015);
        const browMat = hairMat;
        const leftBrow = new THREE.Mesh(browGeo, browMat);
        leftBrow.position.set(-0.065, 1.60, 0.185);
        const rightBrow = new THREE.Mesh(browGeo, browMat);
        rightBrow.position.set(0.065, 1.60, 0.185);
        aGroup.add(leftBrow);
        aGroup.add(rightBrow);

        // Nose
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), skinMat);
        nose.position.set(0, 1.53, 0.20);
        nose.rotation.x = Math.PI / 2;
        aGroup.add(nose);

        // Mouth / Smile
        const mouthGeo = new THREE.BoxGeometry(0.05, 0.012, 0.01);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x991B1B });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, 1.47, 0.195);
        aGroup.add(mouth);

        // Ears
        const earGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const leftEar = new THREE.Mesh(earGeo, skinMat);
        leftEar.position.set(-0.20, 1.54, 0.02);
        const rightEar = new THREE.Mesh(earGeo, skinMat);
        rightEar.position.set(0.20, 1.54, 0.02);
        aGroup.add(leftEar);
        aGroup.add(rightEar);

        // Role-Specific Headwear & Accessories
        if (ag.clothingStyle === 'CONSTRUCTION') {
          // Yellow Safety Hard Hat with Brim
          const hatGeo = new THREE.SphereGeometry(0.23, 14, 14);
          const hatMat = new THREE.MeshStandardMaterial({ color: 0xFACC15, roughness: 0.3 });
          const hat = new THREE.Mesh(hatGeo, hatMat);
          hat.position.set(0, 1.62, 0.02);
          const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 16), hatMat);
          brim.position.set(0, 1.58, 0.04);
          aGroup.add(hat);
          aGroup.add(brim);
        } else if (ag.clothingStyle === 'ENGINEER') {
          // Programmer Headset + Hair
          const hairGeo = new THREE.SphereGeometry(0.21, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.60, -0.02);
          aGroup.add(hair);

          const bandGeo = new THREE.TorusGeometry(0.23, 0.025, 8, 16, Math.PI);
          const bandMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, metalness: 0.7 });
          const band = new THREE.Mesh(bandGeo, bandMat);
          band.position.set(0, 1.65, 0);
          band.rotation.z = Math.PI;
          aGroup.add(band);

          const earpieceGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8);
          const earpieceMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.8 });
          const leftCup = new THREE.Mesh(earpieceGeo, earpieceMat);
          leftCup.rotation.z = Math.PI / 2;
          leftCup.position.set(-0.23, 1.55, 0);
          const rightCup = new THREE.Mesh(earpieceGeo, earpieceMat);
          rightCup.rotation.z = Math.PI / 2;
          rightCup.position.set(0.23, 1.55, 0);
          aGroup.add(leftCup);
          aGroup.add(rightCup);

          // Tablet in left hand
          const tablet = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.02, 0.26),
            new THREE.MeshStandardMaterial({ color: 0x0F172A, metalness: 0.8 })
          );
          tablet.position.set(-0.35, 0.90, 0.20);
          tablet.rotation.set(Math.PI / 4, 0, 0);
          aGroup.add(tablet);
        } else if (ag.clothingStyle === 'ARCHITECT') {
          // Hair + Blueprint tube on back
          const hairGeo = new THREE.SphereGeometry(0.21, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.59, -0.02);
          aGroup.add(hair);

          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8),
            new THREE.MeshStandardMaterial({ color: 0x1E3A8A, roughness: 0.5 })
          );
          tube.position.set(0, 1.10, -0.20);
          tube.rotation.z = Math.PI / 4;
          aGroup.add(tube);
        } else if (ag.clothingStyle === 'QA') {
          // Hair + QA Checklist Clipboard
          const hairGeo = new THREE.SphereGeometry(0.21, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.59, -0.02);
          aGroup.add(hair);

          const clipboard = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.22, 0.02),
            new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.7 })
          );
          clipboard.position.set(0.35, 0.95, 0.18);
          clipboard.rotation.set(Math.PI / 6, 0, 0);
          aGroup.add(clipboard);
        } else if (ag.clothingStyle === 'SECURITY') {
          // Tactical Pauldrons & Crew Cut
          const hairGeo = new THREE.SphereGeometry(0.205, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.58, -0.01);
          aGroup.add(hair);

          const pauldronGeo = new THREE.BoxGeometry(0.18, 0.08, 0.20);
          const pauldronMat = new THREE.MeshStandardMaterial({ color: 0x09090B, metalness: 0.7 });
          const leftP = new THREE.Mesh(pauldronGeo, pauldronMat);
          leftP.position.set(-0.32, 1.35, 0);
          const rightP = new THREE.Mesh(pauldronGeo, pauldronMat);
          rightP.position.set(0.32, 1.35, 0);
          aGroup.add(leftP);
          aGroup.add(rightP);
        } else if (ag.clothingStyle === 'DOCTOR') {
          // Medical Scrub Cap
          const capGeo = new THREE.SphereGeometry(0.22, 14, 14);
          const capMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.5 });
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(0, 1.62, 0);
          aGroup.add(cap);
        } else {
          // Sculpted Executive / Persona Hair
          const hairGeo = new THREE.SphereGeometry(0.21, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.59, -0.02);
          aGroup.add(hair);
        }

        // 6. Glowing District Light Beacon (14 Meters High - Visible Across Metropolis)
        const beaconGeo = new THREE.CylinderGeometry(0.10, 0.45, 14.0, 16);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(ag.color),
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = 7.0;
        aGroup.add(beacon);

        // 7. Glowing Base Status Ring
        const ringGeo = new THREE.RingGeometry(0.65, 0.95, 32);
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
        tCtx.fillText(`[E] 2-Way Comms  •  [F] Work  •  ${ag.status}`, 256, 114);

        const tagTex = new THREE.CanvasTexture(tagCanvas);
        const tagMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.5, 0.72),
          new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, side: THREE.DoubleSide })
        );
        tagMesh.position.y = 2.48;
        aGroup.add(tagMesh);

        // Thought Bubble
        const bubbleMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(3.6, 0.95),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        bubbleMesh.position.y = 3.30;
        aGroup.add(bubbleMesh);
        agentThoughtMeshMap.current.set(ag.id, bubbleMesh);

        // Scale up humanoid character for high visibility & heroic presence
        aGroup.scale.set(1.4, 1.4, 1.4);

        // Save limbs and billboard references for render loop
        (aGroup as any)._leftLeg = leftLegGroup;
        (aGroup as any)._rightLeg = rightLegGroup;
        (aGroup as any)._leftArm = leftArmGroup;
        (aGroup as any)._rightArm = rightArmGroup;
        (aGroup as any)._torso = torso;
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
      
      // If player is close, face the player! Otherwise use agent trajectory heading
      const distToPlayer = Math.hypot(playerState.x - ag.x, playerState.z - ag.z);
      if (distToPlayer <= 4.2) {
        aGroup.rotation.y = Math.atan2(playerState.x - ag.x, playerState.z - ag.z);
      } else {
        aGroup.rotation.y = -ag.angle;
      }

      // Update ring color based on status
      const ring = (aGroup as any)._statusRing;
      if (ring) {
        ring.material.color.setHex(ag.status === 'WORKING' ? 0xF59E0B : 0x10B981);
      }

      // Animate limb walk stride
      const leftLeg = (aGroup as any)._leftLeg;
      const rightLeg = (aGroup as any)._rightLeg;
      const leftArm = (aGroup as any)._leftArm;
      const rightArm = (aGroup as any)._rightArm;
      const isMoving = Math.hypot(ag.x - ag.targetX, ag.z - ag.targetZ) > 0.4 || ag.status === 'TRAVELING';

      if (leftLeg && rightLeg && leftArm && rightArm) {
        if (isMoving) {
          const walkCycle = Date.now() * 0.008 * (ag.speed || 3.2);
          leftLeg.rotation.x = Math.sin(walkCycle) * 0.55;
          rightLeg.rotation.x = -Math.sin(walkCycle) * 0.55;
          leftArm.rotation.x = -Math.sin(walkCycle) * 0.45;
          rightArm.rotation.x = Math.sin(walkCycle) * 0.45;
        } else {
          leftLeg.rotation.x = 0;
          rightLeg.rotation.x = 0;
          leftArm.rotation.x = 0;
          rightArm.rotation.x = 0;
        }
      }

      // Update Thought Bubble
      const bMesh = agentThoughtMeshMap.current.get(ag.id);
      if (bMesh) {
        if (ag.thoughtBubble) {
          const mat = bMesh.material as THREE.MeshBasicMaterial;
          mat.map = createThoughtTexture(ag.thoughtBubble);
          mat.opacity = 1.0;
          mat.needsUpdate = true;
          bMesh.visible = true;
        } else {
          bMesh.visible = false;
        }
      }
    });
  }, [agentCharacters, playerState.x, playerState.z]);

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
