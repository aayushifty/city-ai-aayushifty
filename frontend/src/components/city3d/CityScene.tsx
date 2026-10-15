import React, { useEffect, useRef } from 'react';
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
  AgentCharacter 
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
  onSelectEntity: (type: 'BUILDING' | 'VEHICLE' | 'AGENT', id: string) => void;
  onDoubleClickAgent: (agentId: string) => void;
  onMoveAgent?: (agentId: string, dx: number, dz: number) => void;
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
  onSelectEntity,
  onDoubleClickAgent,
  onMoveAgent
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

  // Camera Orbit & Pan State
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

    // Dark high-tech badge background
    ctx.fillStyle = '#060B18';
    ctx.fillRect(0, 0, 512, 128);

    // Glowing neon border
    ctx.lineWidth = 6;
    ctx.strokeStyle = colorHex;
    ctx.strokeRect(4, 4, 504, 120);

    // High-tech corner accents
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 24, 8);
    ctx.fillRect(0, 0, 8, 24);
    ctx.fillRect(512 - 24, 0, 24, 8);
    ctx.fillRect(512 - 8, 0, 8, 24);

    // Text Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
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

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
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

    const camera = new THREE.PerspectiveCamera(
      45,
      width / height,
      0.1,
      1200
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Lights
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

      // Elevated Sidewalks
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

    // Build Named Buildings with Floating Neon Signboards
    buildings.forEach(b => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, 0, b.z);
      bGroup.userData = { type: 'BUILDING', id: b.id };

      if (b.type === 'PARK_SPACE') {
        // Central Innovation Plaza
        const pGeo = new THREE.BoxGeometry(b.width, 0.25, b.depth);
        const pMat = new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.9 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.y = 0.12;
        bGroup.add(pMesh);

        // Circular Amphitheater / Forum in Plaza
        const forumGeo = new THREE.CylinderGeometry(5.5, 6.0, 0.35, 24);
        const forumMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.5 });
        const forum = new THREE.Mesh(forumGeo, forumMat);
        forum.position.y = 0.3;
        bGroup.add(forum);

        // Holographic Forum Core
        const coreGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.6, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = 0.6;
        bGroup.add(core);

        // Surrounding Trees
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

        // Roof details (Antenna, Helipad, Chimney)
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

    // Raycaster for Single Click & Double Click Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let lastClickTime = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        orbitState.current.isDragging = true;
        orbitState.current.prevX = e.clientX;
        orbitState.current.prevY = e.clientY;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (orbitState.current.isDragging) {
        const dx = e.clientX - orbitState.current.prevX;
        const dy = e.clientY - orbitState.current.prevY;
        orbitState.current.prevX = e.clientX;
        orbitState.current.prevY = e.clientY;

        orbitState.current.angleX -= dx * 0.005;
        orbitState.current.angleY = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, orbitState.current.angleY + dy * 0.005));
      }

      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    };

    const onMouseUp = () => {
      orbitState.current.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      orbitState.current.distance = Math.max(12, Math.min(180, orbitState.current.distance + e.deltaY * 0.08));
      e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      if (!cameraRef.current) return;
      raycaster.setFromCamera(mouse, cameraRef.current);

      const currentTime = performance.now();
      const isDoubleClick = (currentTime - lastClickTime) < 300;
      lastClickTime = currentTime;

      // 1. Raycast against AI Agent characters first
      const agentMeshes: THREE.Object3D[] = [];
      agentMeshMap.current.forEach(agG => {
        agG.traverse(child => { if ((child as THREE.Mesh).isMesh) agentMeshes.push(child); });
      });
      const agHits = raycaster.intersectObjects(agentMeshes);
      if (agHits.length > 0) {
        let curr: THREE.Object3D | null = agHits[0].object;
        while (curr && !curr.userData?.id) {
          curr = curr.parent;
        }
        if (curr?.userData?.id) {
          const aId = curr.userData.id;
          onSelectEntity('AGENT', aId);
          if (isDoubleClick) {
            onDoubleClickAgent(aId);
          }
          return;
        }
      }

      // 2. Raycast against Buildings
      const bMeshes: THREE.Object3D[] = [];
      buildingGroupMap.current.forEach(bG => {
        bG.traverse(child => { if ((child as THREE.Mesh).isMesh) bMeshes.push(child); });
      });
      const bHits = raycaster.intersectObjects(bMeshes);
      if (bHits.length > 0) {
        let curr: THREE.Object3D | null = bHits[0].object;
        while (curr && !curr.userData?.id) {
          curr = curr.parent;
        }
        if (curr?.userData?.id) {
          onSelectEntity('BUILDING', curr.userData.id);
        }
      }
    };

    // Keyboard WASD listener for FPV mode
    const onKeyDown = (e: KeyboardEvent) => {
      if (cameraMode === 'FPV' && selectedAgentId && onMoveAgent) {
        const moveSpeed = 1.2;
        if (e.key === 'w' || e.key === 'ArrowUp') onMoveAgent(selectedAgentId, 0, -moveSpeed);
        if (e.key === 's' || e.key === 'ArrowDown') onMoveAgent(selectedAgentId, 0, moveSpeed);
        if (e.key === 'a' || e.key === 'ArrowLeft') onMoveAgent(selectedAgentId, -moveSpeed, 0);
        if (e.key === 'd' || e.key === 'ArrowRight') onMoveAgent(selectedAgentId, moveSpeed, 0);
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);

    // 60 FPS Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Handle Camera Modes (FPV, Shoulder Cam, Orbit, Top-Down)
      const st = orbitState.current;
      const targetAgent = agentCharacters.find(a => a.id === selectedAgentId);

      if (cameraMode === 'FPV' && targetAgent) {
        // True First Person View through Agent's Eyes
        camera.position.set(targetAgent.x, 1.85, targetAgent.z);
        const lookX = targetAgent.x + Math.cos(targetAgent.angle) * 10;
        const lookZ = targetAgent.z + Math.sin(targetAgent.angle) * 10;
        camera.lookAt(lookX, 1.85, lookZ);
      } else if (cameraMode === 'SHOULDER_CAM' && targetAgent) {
        // Cinematic Over-the-Shoulder Tracking Cam
        const back = 3.6;
        const cx = targetAgent.x - Math.cos(targetAgent.angle) * back;
        const cz = targetAgent.z - Math.sin(targetAgent.angle) * back;
        camera.position.lerp(new THREE.Vector3(cx, 2.5, cz), 0.15);
        camera.lookAt(targetAgent.x, 1.6, targetAgent.z);
      } else if (cameraMode === 'TOP_DOWN') {
        camera.position.set(0, 120, 0.1);
        camera.lookAt(0, 0, 0);
      } else if (cameraMode === 'STREET_LEVEL') {
        camera.position.set(0, 3.2, 28);
        camera.lookAt(0, 3.2, -30);
      } else {
        // Orbit mode
        camera.position.x = st.target.x + st.distance * Math.sin(st.angleX) * Math.cos(st.angleY);
        camera.position.z = st.target.z + st.distance * Math.cos(st.angleX) * Math.cos(st.angleY);
        camera.position.y = st.target.y + st.distance * Math.sin(st.angleY);
        camera.lookAt(st.target);
      }

      renderer.render(scene, camera);
    };
    animate();

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
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // --- Dynamic AI Agent Character 3D Meshes & Speech Bubbles ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    agentCharacters.forEach(ag => {
      let aGroup = agentMeshMap.current.get(ag.id);
      if (!aGroup) {
        aGroup = new THREE.Group();
        aGroup.userData = { type: 'AGENT', id: ag.id };

        // 1. Stylized 3D Cyber Body
        const bodyGeo = new THREE.CylinderGeometry(0.35, 0.28, 1.1, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(ag.color),
          metalness: 0.6,
          roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        body.castShadow = true;
        aGroup.add(body);

        // Glowing Armor Core / Arc Reactor
        const coreGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(0, 1.05, 0.32);
        aGroup.add(core);

        // Cyber Helmet & Glowing Visor
        const headGeo = new THREE.SphereGeometry(0.24, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.8 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        aGroup.add(head);

        const visorGeo = new THREE.BoxGeometry(0.3, 0.08, 0.15);
        const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ag.color) });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.7, 0.2);
        aGroup.add(visor);

        // Floating Overhead Hologram Nameplate
        const tagCanvas = document.createElement('canvas');
        tagCanvas.width = 256; tagCanvas.height = 64;
        const tCtx = tagCanvas.getContext('2d')!;
        tCtx.fillStyle = '#060B18CC';
        if (typeof (tCtx as any).roundRect === 'function') {
          (tCtx as any).roundRect(4, 4, 248, 56, 12);
          tCtx.fill();
        } else {
          tCtx.fillRect(4, 4, 248, 56);
        }
        tCtx.lineWidth = 3;
        tCtx.strokeStyle = ag.color;
        if (typeof (tCtx as any).roundRect === 'function') {
          tCtx.stroke();
        } else {
          tCtx.strokeRect(4, 4, 248, 56);
        }
        tCtx.fillStyle = '#FFFFFF';
        tCtx.font = 'bold 20px monospace';
        tCtx.textAlign = 'center';
        tCtx.textBaseline = 'middle';
        tCtx.fillText(ag.name.split(' ')[0], 128, 32);

        const tagTex = new THREE.CanvasTexture(tagCanvas);
        const tagMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 0.45),
          new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, side: THREE.DoubleSide })
        );
        tagMesh.position.y = 2.25;
        aGroup.add(tagMesh);

        // Floating Thought/Speech Bubble Mesh
        const bubbleMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(3.5, 0.9),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        bubbleMesh.position.y = 3.0;
        aGroup.add(bubbleMesh);
        agentThoughtMeshMap.current.set(ag.id, bubbleMesh);

        scene.add(aGroup);
        agentMeshMap.current.set(ag.id, aGroup);
      }

      // Update position & heading angle
      aGroup.position.set(ag.x, 0.05, ag.z);
      aGroup.rotation.y = -ag.angle;

      // Update Thought Bubble texture when speech is active
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

        scene.add(vGroup);
        vehicleGroupMap.current.set(v.id, vGroup);
      }

      vGroup.position.set(v.x, 0.05, v.z);
      vGroup.rotation.y = -v.angle;
    });
  }, [vehicles]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
