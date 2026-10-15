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
  onSelectEntity
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

  // --- Initial Scene Setup ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.005);

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

    // Ambient and Directional Lights
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.55);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const hemi = new THREE.HemisphereLight(0x38BDF8, 0x0F172A, 0.4);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const sun = new THREE.DirectionalLight(0xFFFBEB, 1.35);
    sun.position.set(70, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);
    sunLightRef.current = sun;

    // Ground Plate
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x070B14, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(260, 52, 0x1E293B, 0x0F172A);
    grid.position.y = -0.02;
    scene.add(grid);

    // Build Roads & Sidewalks
    roads.forEach(r => {
      const dx = r.end[0] - r.start[0];
      const dz = r.end[1] - r.start[1];
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const midX = (r.start[0] + r.end[0]) / 2;
      const midZ = (r.start[1] + r.end[1]) / 2;

      const roadGeo = new THREE.PlaneGeometry(length, 5.2);
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x141B29, roughness: 0.8 });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -angle;
      roadMesh.position.set(midX, 0.02, midZ);
      roadMesh.receiveShadow = true;
      roadMesh.userData = { type: 'ROAD', id: r.id };
      scene.add(roadMesh);
      roadMeshMap.current.set(r.id, roadMesh);

      // Center Line
      const lineGeo = new THREE.PlaneGeometry(length * 0.95, 0.18);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xF8FAFC });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = -angle;
      line.position.set(midX, 0.03, midZ);
      scene.add(line);

      // Concrete Sidewalks
      const swMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
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

    // Build Named Buildings with Floating Signboards
    buildings.forEach(b => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, 0, b.z);
      bGroup.userData = { type: 'BUILDING', id: b.id };

      if (b.type === 'PARK_SPACE') {
        // Innovation Plaza
        const pGeo = new THREE.BoxGeometry(b.width, 0.25, b.depth);
        const pMat = new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.9 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.y = 0.12;
        bGroup.add(pMesh);

        // Circular Forum
        const forum = new THREE.Mesh(
          new THREE.CylinderGeometry(5.5, 6.0, 0.35, 24),
          new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.5 })
        );
        forum.position.y = 0.3;
        bGroup.add(forum);

        // Forum Hologram Core
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 0.6, 16),
          new THREE.MeshBasicMaterial({ color: 0x38BDF8 })
        );
        core.position.y = 0.6;
        bGroup.add(core);

        // Park Trees
        [[-7, -7], [7, -7], [-7, 7], [7, 7]].forEach(([tx, tz]) => {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.0), new THREE.MeshStandardMaterial({ color: 0x78350F }));
          trunk.position.set(tx, 1.0, tz);
          bGroup.add(trunk);
          const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x16A34A }));
          foliage.position.set(tx, 3.0, tz);
          bGroup.add(foliage);
        });

      } else {
        // Multi-tier architecture
        const bGeo = new THREE.BoxGeometry(b.width, b.height, b.depth);
        const bMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(b.facadeColor),
          roughness: 0.35,
          metalness: 0.55
        });
        const mesh = new THREE.Mesh(bGeo, bMat);
        mesh.position.y = b.height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bGroup.add(mesh);

        // Roof features
        if (b.roofStyle === 'ANTENNA') {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.35, 8.0, 6), new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.9 }));
          spire.position.y = b.height + 4.0;
          bGroup.add(spire);

          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xEF4444 }));
          beacon.position.y = b.height + 8.1;
          bGroup.add(beacon);
        } else if (b.roofStyle === 'HELIPAD') {
          const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x1E293B }));
          pad.position.y = b.height + 0.15;
          bGroup.add(pad);
        } else if (b.roofStyle === 'PITCHED') {
          const roof = new THREE.Mesh(new THREE.ConeGeometry(b.width * 0.75, 2.4, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor) }));
          roof.rotation.y = Math.PI / 4;
          roof.position.y = b.height + 1.2;
          bGroup.add(roof);
        }
      }

      // Add Floating 3D Neon Signboard for Named Buildings
      if (b.signName) {
        const signGeo = new THREE.PlaneGeometry(7.0, 1.8);
        const signMat = new THREE.MeshBasicMaterial({
          map: createSignboardTexture(b.signName, b.accentColor),
          transparent: true,
          side: THREE.DoubleSide
        });
        const signboard = new THREE.Mesh(signGeo, signMat);
        signboard.position.set(0, b.height + 2.5, 0);
        bGroup.add(signboard);
      }

      scene.add(bGroup);
      buildingGroupMap.current.set(b.id, bGroup);
    });

    // Pointer Lock & Mouse Look Listeners
    const onCanvasClick = () => {
      if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL') {
        container.requestPointerLock();
      }
    };

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === container;
      fpv.current.isPointerLocked = isLocked;
      onUpdatePlayer({ isPointerLocked: isLocked });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (fpv.current.isPointerLocked) {
        // First-Person Mouse Look
        const sensitivity = 0.0022;
        fpv.current.yaw -= e.movementX * sensitivity;
        fpv.current.pitch = Math.max(-1.4, Math.min(1.4, fpv.current.pitch - e.movementY * sensitivity));
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
        if (fpv.current.isGrounded) {
          fpv.current.velocityY = 6.8;
          fpv.current.isGrounded = false;
        }
      }

      // 'E' Key: Interact with nearby citizen (open 2-way comms)
      if (k === 'e') {
        if (playerState.nearbyAgentId) {
          if (document.pointerLockElement) document.exitPointerLock();
          onInteractWithAgent(playerState.nearbyAgentId);
        }
      }

      // 'F' Key: Direct Work Command (Make citizen work immediately)
      if (k === 'f') {
        if (playerState.nearbyAgentId) {
          onDirectWorkCommand(playerState.nearbyAgentId);
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

      // 1. WASD Movement Physics (when in first-person or street level)
      if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL' || cameraMode === 'SHOULDER_CAM') {
        const moveSpeed = (p.keys.shift ? 10.5 : 5.8) * dt;
        let moveX = 0;
        let moveZ = 0;

        // Forward vector based on yaw
        const forwardX = -Math.sin(p.yaw);
        const forwardZ = -Math.cos(p.yaw);
        const rightX = Math.cos(p.yaw);
        const rightZ = -Math.sin(p.yaw);

        if (p.keys.w) { moveX += forwardX; moveZ += forwardZ; }
        if (p.keys.s) { moveX -= forwardX; moveZ -= forwardZ; }
        if (p.keys.d) { moveX += rightX; moveZ += rightZ; }
        if (p.keys.a) { moveX -= rightX; moveZ -= rightZ; }

        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0.001) {
          const proposedX = p.x + (moveX / moveLen) * moveSpeed;
          const proposedZ = p.z + (moveZ / moveLen) * moveSpeed;

          // Collision Detection against Solid Buildings (bounding box radius 0.6)
          let collidesX = false;
          let collidesZ = false;

          for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            if (b.type === 'PARK_SPACE') continue;

            const minX = b.x - b.width / 2 - 0.7;
            const maxX = b.x + b.width / 2 + 0.7;
            const minZ = b.z - b.depth / 2 - 0.7;
            const maxZ = b.z + b.depth / 2 + 0.7;

            if (proposedX >= minX && proposedX <= maxX && p.z >= minZ && p.z <= maxZ) {
              collidesX = true;
            }
            if (p.x >= minX && p.x <= maxX && proposedZ >= minZ && proposedZ <= maxZ) {
              collidesZ = true;
            }
          }

          if (!collidesX && Math.abs(proposedX) < 115) p.x = proposedX;
          if (!collidesZ && Math.abs(proposedZ) < 115) p.z = proposedZ;
        }

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

        // Sync player state with React
        onUpdatePlayer({
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          pitch: p.pitch,
          isSprinting: p.keys.shift,
          isGrounded: p.isGrounded
        });
      }

      // 2. Camera Positioning
      if (cameraMode === 'FPV' || cameraMode === 'STREET_LEVEL') {
        // First-Person Player View
        camera.position.set(p.x, p.y, p.z);
        // Look direction vector from yaw and pitch
        const lookDir = new THREE.Vector3(
          -Math.sin(p.yaw) * Math.cos(p.pitch),
          Math.sin(p.pitch),
          -Math.cos(p.yaw) * Math.cos(p.pitch)
        );
        camera.lookAt(new THREE.Vector3().addVectors(camera.position, lookDir));

      } else if (cameraMode === 'SHOULDER_CAM') {
        // Third-Person Over-the-Shoulder Chase
        const back = 3.2;
        const camX = p.x + Math.sin(p.yaw) * back + Math.cos(p.yaw) * 0.8;
        const camZ = p.z + Math.cos(p.yaw) * back - Math.sin(p.yaw) * 0.8;
        camera.position.set(camX, p.y + 0.8, camZ);
        camera.lookAt(p.x, p.y, p.z);

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

        // 5. Neck & Head with Realistic Face
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.14, 8), skinMat);
        neck.position.y = 1.38;
        aGroup.add(neck);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 16), skinMat);
        head.position.y = 1.54;
        head.castShadow = true;
        aGroup.add(head);

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const pupilGeo = new THREE.SphereGeometry(0.012, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

        const leftEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
        leftEye.position.set(-0.065, 1.56, 0.18);
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(-0.065, 1.56, 0.20);
        aGroup.add(leftEye);
        aGroup.add(leftPupil);

        const rightEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
        rightEye.position.set(0.065, 1.56, 0.18);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.set(0.065, 1.56, 0.20);
        aGroup.add(rightEye);
        aGroup.add(rightPupil);

        // Nose
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), skinMat);
        nose.position.set(0, 1.53, 0.20);
        nose.rotation.x = Math.PI / 2;
        aGroup.add(nose);

        // Hair or Hard Hat
        if (ag.clothingStyle === 'CONSTRUCTION') {
          // Yellow Safety Hard Hat
          const hatGeo = new THREE.SphereGeometry(0.23, 12, 12);
          const hatMat = new THREE.MeshStandardMaterial({ color: 0xFACC15, roughness: 0.3 });
          const hat = new THREE.Mesh(hatGeo, hatMat);
          hat.position.set(0, 1.62, 0.02);
          const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 16), hatMat);
          brim.position.set(0, 1.58, 0.04);
          aGroup.add(hat);
          aGroup.add(brim);
        } else {
          // Sculpted Hair
          const hairGeo = new THREE.SphereGeometry(0.21, 14, 14);
          const hair = new THREE.Mesh(hairGeo, hairMat);
          hair.position.set(0, 1.59, -0.02);
          aGroup.add(hair);
        }

        // 6. Glowing Base Status Ring
        const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ag.status === 'WORKING' ? 0xF59E0B : 0x10B981,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        aGroup.add(ring);

        // 7. Overhead Holographic Badge showing Citizen Name + AI Model + Worker Role + Keys
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
        tCtx.fillText(ag.name, 256, 32);

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

        // Save limbs for walk cycle animation
        (aGroup as any)._leftLeg = leftLegGroup;
        (aGroup as any)._rightLeg = rightLegGroup;
        (aGroup as any)._leftArm = leftArmGroup;
        (aGroup as any)._rightArm = rightArmGroup;
        (aGroup as any)._torso = torso;
        (aGroup as any)._statusRing = ring;

        scene.add(aGroup);
        agentMeshMap.current.set(ag.id, aGroup);
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

        scene.add(vGroup);
        vehicleGroupMap.current.set(v.id, vGroup);
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
