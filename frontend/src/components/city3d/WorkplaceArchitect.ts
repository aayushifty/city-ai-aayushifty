import * as THREE from 'three';
import { Building } from '../../simulation/types';

/**
 * Architectural Builder for Genuine Character Workplaces in city_ai_aayushifty.
 * Replaces generic extruded boxes with specialized, character-tailored facilities:
 * - Fabrication Foundry (Devon Cross - Software Engineer)
 * - QA Bastion (Elena Rostova - Automated Verification Lead)
 * - Blueprint Complex (Marcus Vance - Software Architect)
 * - Vision Lab (Dr. Maya Lin - Product Requirements Analyst)
 * - Security Citadel (Kaelen Voss - Security Sentinel)
 * - Cloud Release Dock (Sora Takahashi - DevOps & SRE Lead)
 * - Civic Trauma Center (Dr. Sarah Miller - Medical Director)
 * - Diagnostic Core (Dr. Aaron Chen - Root Cause Specialist)
 * - Citadel Spire (Alex Vance - Master Orchestrator)
 * - Civic Construction Yard (Harlan Drake - Civil Construction Lead)
 * - Innovation Plaza (Public Mission Forum)
 * - Detailed Urban Storefronts & Townhouses
 */

export class WorkplaceArchitect {
  private static sharedMaterials: Map<string, THREE.Material> = new Map();

  private static getMaterial(key: string, creator: () => THREE.Material): THREE.Material {
    if (!this.sharedMaterials.has(key)) {
      this.sharedMaterials.set(key, creator());
    }
    return this.sharedMaterials.get(key)!;
  }

  public static buildWorkplace(
    b: Building, 
    createSignboardTexture: (text: string, colorHex: string) => THREE.CanvasTexture
  ): THREE.Group {
    const bGroup = new THREE.Group();
    bGroup.position.set(b.x, 0, b.z);
    bGroup.userData = { type: 'BUILDING', id: b.id };

    if (b.id === 'bld-park' || b.type === 'PARK_SPACE') {
      this.buildInnovationPlaza(bGroup, b);
    } else if (b.id === 'bld-foundry') {
      this.buildFabricationFoundry(bGroup, b);
    } else if (b.id === 'bld-qa-bastion') {
      this.buildQABastion(bGroup, b);
    } else if (b.id === 'bld-blueprint') {
      this.buildBlueprintComplex(bGroup, b);
    } else if (b.id === 'bld-vision-lab') {
      this.buildVisionLab(bGroup, b);
    } else if (b.id === 'bld-security') {
      this.buildSecurityCitadel(bGroup, b);
    } else if (b.id === 'bld-release-dock') {
      this.buildReleaseDock(bGroup, b);
    } else if (b.id === 'bld-hospital') {
      this.buildTraumaCenter(bGroup, b);
    } else if (b.id === 'bld-diagnostic') {
      this.buildDiagnosticCore(bGroup, b);
    } else if (b.id === 'bld-citadel') {
      this.buildCitadelSpire(bGroup, b);
    } else if (b.id === 'bld-construction' || b.underConstruction) {
      this.buildConstructionYard(bGroup, b);
    } else {
      this.buildUrbanLivingBlock(bGroup, b);
    }

    // Floating 3D Neon Signboard
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

    return bGroup;
  }

  // --- 1. Central Innovation Plaza & Public Forum ---
  private static buildInnovationPlaza(g: THREE.Group, b: Building): void {
    // Polished stone plaza platform
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.8 });
    const plazaBase = new THREE.Mesh(new THREE.BoxGeometry(b.width, 0.35, b.depth), baseMat);
    plazaBase.position.y = 0.17;
    plazaBase.receiveShadow = true;
    g.add(plazaBase);

    // Radial illuminated conduits
    const conduitMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8 });
    for (let i = 0; i < 4; i++) {
      const conduit = new THREE.Mesh(new THREE.PlaneGeometry(0.3, b.width * 0.42), conduitMat);
      conduit.rotation.x = -Math.PI / 2;
      conduit.rotation.z = (i * Math.PI) / 2;
      conduit.position.y = 0.36;
      g.add(conduit);
    }

    // Stepped Sunken Forum Amphitheater
    const amphitheaterMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
    for (let step = 0; step < 3; step++) {
      const rad = 7.5 - step * 1.2;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(rad, rad + 0.3, 0.25, 28),
        amphitheaterMat
      );
      ring.position.y = 0.35 + step * 0.25;
      ring.receiveShadow = true;
      g.add(ring);
    }

    // Central Holographic Forum Dais
    const daisMat = new THREE.MeshStandardMaterial({ color: 0x090D1A, metalness: 0.8, roughness: 0.2 });
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 0.6, 24), daisMat);
    dais.position.y = 1.1;
    g.add(dais);

    // Glowing Holographic Core (Rotating Icosahedron Globe)
    const holoGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38BDF8,
      transparent: true,
      opacity: 0.45,
      transmission: 0.7,
      roughness: 0.1
    });
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 16), holoGlassMat);
    chamber.position.y = 2.4;
    g.add(chamber);

    const wireMat = new THREE.MeshBasicMaterial({ color: 0x67E8F9, wireframe: true });
    const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), wireMat);
    globe.position.y = 2.4;
    globe.userData = { rotSpeed: 0.6 };
    g.add(globe);

    const coreLight = new THREE.PointLight(0x38BDF8, 2.0, 18);
    coreLight.position.y = 2.4;
    g.add(coreLight);

    // 4 Public Mission Hologram Kiosks
    const kioskMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.7 });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x06B6D4 });
    [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]].forEach(([kx, kz]) => {
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), kioskMat);
      kiosk.position.set(kx, 0.7 + 0.35, kz);
      g.add(kiosk);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), screenMat);
      screen.position.set(kx, 1.6 + 0.35, kz);
      screen.lookAt(0, 1.6, 0);
      g.add(screen);
    });

    // Planters & Landscaped Trees
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 });
    [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]].forEach(([tx, tz]) => {
      const planter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 3.6), planterMat);
      planter.position.set(tx, 0.5, tz);
      g.add(planter);

      const grass = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 3.4), grassMat);
      grass.position.set(tx, 0.81, tz);
      g.add(grass);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2), new THREE.MeshStandardMaterial({ color: 0x78350F }));
      trunk.position.set(tx, 1.9, tz);
      g.add(trunk);

      for (let layer = 0; layer < 3; layer++) {
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(1.6 - layer * 0.35, 1.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.8 })
        );
        foliage.position.set(tx, 3.0 + layer * 1.1, tz);
        g.add(foliage);
      }
    });
  }

  // --- 2. Fabrication Foundry (Devon Cross - Software Engineer) ---
  private static buildFabricationFoundry(g: THREE.Group, b: Building): void {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x27272A, metalness: 0.8, roughness: 0.3 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x78350F, metalness: 0.6, roughness: 0.4 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0284C7, transparent: true, opacity: 0.65, roughness: 0.1 });
    const amberGlow = new THREE.MeshBasicMaterial({ color: 0xF59E0B });
    const cyanGlow = new THREE.MeshBasicMaterial({ color: 0x06B6D4 });

    // Tier 1: Heavy Bronze/Steel Foundry Base (0-7m)
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.width, 7, b.depth), bronzeMat);
    base.position.y = 3.5;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    // Exposed Corner Steel I-Beams
    [[-b.width / 2, -b.depth / 2], [b.width / 2, -b.depth / 2], [-b.width / 2, b.depth / 2], [b.width / 2, b.depth / 2]].forEach(([cx, cz]) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.2, 0.6), steelMat);
      beam.position.set(cx, 3.6, cz);
      g.add(beam);
    });

    // Industrial Roll-Up Delivery Doors with Hazard Stripes
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x18181B, metalness: 0.8 });
    const bayDoor = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.0), doorMat);
    bayDoor.position.set(0, 2.0, b.depth / 2 + 0.05);
    g.add(bayDoor);

    const hazardStripe = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.35), amberGlow);
    hazardStripe.position.set(0, 4.15, b.depth / 2 + 0.06);
    g.add(hazardStripe);

    // Tier 2: Cantilevered Developer Loft with Smoked Glass (7-15m)
    const loftWidth = b.width + 1.8;
    const loftDepth = b.depth + 1.2;
    const loft = new THREE.Mesh(new THREE.BoxGeometry(loftWidth, 8, loftDepth), glassMat);
    loft.position.y = 11;
    g.add(loft);

    // Visible Interior Workstation Desks with Dual Glowing Code Monitors
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x1E293B });
    [[-2.2, -1.8], [2.2, -1.8], [-2.2, 1.8], [2.2, 1.8]].forEach(([dx, dz]) => {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.8), deskMat);
      desk.position.set(dx, 8.5, dz);
      g.add(desk);

      const mon1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), cyanGlow);
      mon1.position.set(dx - 0.28, 9.05, dz);
      mon1.rotation.y = 0.2;
      g.add(mon1);

      const mon2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), amberGlow);
      mon2.position.set(dx + 0.28, 9.05, dz);
      mon2.rotation.y = -0.2;
      g.add(mon2);
    });

    // Tier 3: Server Core Penthouse (15-22m)
    const serverCore = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, 7, b.depth * 0.7), steelMat);
    serverCore.position.y = 18.5;
    g.add(serverCore);

    // Vertical Blinking Server LED Columns
    for (let r = 0; r < 4; r++) {
      const ledCol = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 5.0), r % 2 === 0 ? cyanGlow : amberGlow);
      ledCol.position.set(-2.0 + r * 1.3, 18.5, b.depth * 0.35 + 0.05);
      g.add(ledCol);
    }

    // Rooftop Industrial Cooling Stacks & Fans
    const stackMat = new THREE.MeshStandardMaterial({ color: 0x3F3F46, metalness: 0.7 });
    [-2.2, 2.2].forEach(sx => {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 3.2, 16), stackMat);
      stack.position.set(sx, 23.6, 0);
      g.add(stack);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 16), steelMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(sx, 25.2, 0);
      g.add(rim);
    });
  }

  // --- 3. QA Bastion (Elena Rostova - Automated Verification Lead) ---
  private static buildQABastion(g: THREE.Group, b: Building): void {
    const titanMat = new THREE.MeshStandardMaterial({ color: 0x064E3B, metalness: 0.75, roughness: 0.3 });
    const emeraldGlass = new THREE.MeshPhysicalMaterial({ color: 0x10B981, transparent: true, opacity: 0.6 });
    const laserGreen = new THREE.MeshBasicMaterial({ color: 0x34D399 });

    // Tier 1: Hexagonal Armored Base (0-9m)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(b.width * 0.65, b.width * 0.7, 9, 6), titanMat);
    base.position.y = 4.5;
    base.castShadow = true;
    g.add(base);

    // Tier 2: 4 Protruding Automated Testing Chambers with Green Laser Grids (9-18m)
    const midTower = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.8, 9, b.depth * 0.8), titanMat);
    midTower.position.y = 13.5;
    g.add(midTower);

    // Glass test chambers projecting from walls
    [-1, 1].forEach(dir => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6.0, 1.6), emeraldGlass);
      pod.position.set(dir * (b.width * 0.42), 13.5, 0);
      g.add(pod);

      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.8, 8), laserGreen);
      laser.position.set(dir * (b.width * 0.42), 13.5, 0);
      g.add(laser);
    });

    // Tier 3: Panoramic Verification Observation Gallery (18-26m)
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(b.width * 0.55, b.width * 0.45, 8, 8), emeraldGlass);
    gallery.position.y = 22;
    g.add(gallery);

    // Rooftop Automated Radar Dome & Sensor Mast
    const radarDish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), titanMat);
    radarDish.rotation.x = Math.PI * 0.65;
    radarDish.position.set(-1.8, 27.5, 0);
    radarDish.userData = { rotSpeed: 0.5 };
    g.add(radarDish);

    // Vertical Calibration Laser Pylon
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6.5, 8), titanMat);
    pylon.position.set(1.5, 29.2, 0);
    g.add(pylon);

    const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12.0, 8), laserGreen);
    laserBeam.position.set(1.5, 38.0, 0);
    g.add(laserBeam);
  }

  // --- 4. Blueprint Complex (Marcus Vance - Software Architect) ---
  private static buildBlueprintComplex(g: THREE.Group, b: Building): void {
    const navySteel = new THREE.MeshStandardMaterial({ color: 0x1E3A8A, metalness: 0.7, roughness: 0.3 });
    const blueprintGlass = new THREE.MeshPhysicalMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.55, roughness: 0.1 });
    const whiteTruss = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, metalness: 0.5, roughness: 0.3 });
    const cyanWire = new THREE.MeshBasicMaterial({ color: 0x00F0FF, wireframe: true });

    // Open Ground Colonnade with White V-Trusses (0-8m)
    const groundFloor = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.8, 8, b.depth * 0.8), blueprintGlass);
    groundFloor.position.y = 4.0;
    g.add(groundFloor);

    // Diagonal Space-frame V-Pillars
    [-b.width * 0.45, b.width * 0.45].forEach(px => {
      const vCol1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8.5, 8), whiteTruss);
      vCol1.rotation.z = px > 0 ? 0.25 : -0.25;
      vCol1.position.set(px, 4.0, b.depth * 0.4);
      g.add(vCol1);
    });

    // Dramatic Cantilevered Architecture Studio Wing (8-22m, extending 4m over street!)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(b.width + 3.8, 14, b.depth), navySteel);
    wing.position.set(1.9, 15, 0);
    wing.castShadow = true;
    g.add(wing);

    // Blueprint Floor-to-Ceiling Windows
    const studioWindows = new THREE.Mesh(new THREE.PlaneGeometry(b.width + 3.6, 11), blueprintGlass);
    studioWindows.position.set(1.9, 15, b.depth / 2 + 0.05);
    g.add(studioWindows);

    // Upper Stepped Terraces (22-34m)
    const upperTower = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.65, 12, b.depth * 0.65), navySteel);
    upperTower.position.set(0, 28, 0);
    g.add(upperTower);

    // Rooftop Architecture Terrace: Rotating 3D Geometric Model
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.5, 8), whiteTruss);
    pedestal.position.set(0, 34.7, 0);
    g.add(pedestal);

    const archModel = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), cyanWire);
    archModel.position.set(0, 37.0, 0);
    archModel.userData = { rotSpeed: 0.4 };
    g.add(archModel);
  }

  // --- 5. Product Vision Lab (Dr. Maya Lin - PRD Analyst) ---
  private static buildVisionLab(g: THREE.Group, b: Building): void {
    const purpleMat = new THREE.MeshStandardMaterial({ color: 0x581C87, metalness: 0.6, roughness: 0.35 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.9, roughness: 0.1 });
    const domeGlass = new THREE.MeshPhysicalMaterial({ color: 0xC084FC, transparent: true, opacity: 0.5, roughness: 0.1 });
    const neonViolet = new THREE.MeshBasicMaterial({ color: 0xD8B4FE, wireframe: true });

    // Cylindrical Curved Base Tower (0-22m)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(b.width * 0.5, b.width * 0.55, 22, 28), purpleMat);
    tower.position.y = 11;
    tower.castShadow = true;
    g.add(tower);

    // Chrome Horizontal Accent Rings
    [5, 11, 17].forEach(yPos => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.width * 0.53, 0.12, 8, 32), chromeMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yPos;
      g.add(ring);
    });

    // Helical Spiraling Exterior Observation Walkway
    const rampCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-b.width * 0.58, 4, 0),
      new THREE.Vector3(0, 10, b.width * 0.58),
      new THREE.Vector3(b.width * 0.58, 16, 0),
      new THREE.Vector3(0, 22, -b.width * 0.58),
    ]);
    const rampGeo = new THREE.TubeGeometry(rampCurve, 32, 0.3, 8, false);
    const rampMesh = new THREE.Mesh(rampGeo, chromeMat);
    g.add(rampMesh);

    // Geodesic Glass Dome (22-30m)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(b.width * 0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeGlass);
    dome.position.y = 22;
    g.add(dome);

    // Inside Dome: Rotating Holographic Requirements Sphere
    const reqSphere = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 16), neonViolet);
    reqSphere.position.y = 25.5;
    reqSphere.userData = { rotSpeed: -0.35 };
    g.add(reqSphere);

    // Orbiting Data Ring
    const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xA855F7 }));
    orbitRing.rotation.x = Math.PI / 3;
    orbitRing.position.y = 25.5;
    orbitRing.userData = { rotSpeed: 0.7 };
    g.add(orbitRing);
  }

  // --- 6. Security Citadel (Kaelen Voss - Security Sentinel) ---
  private static buildSecurityCitadel(g: THREE.Group, b: Building): void {
    const stealthArmor = new THREE.MeshStandardMaterial({ color: 0x09090B, metalness: 0.85, roughness: 0.3 });
    const redHazard = new THREE.MeshBasicMaterial({ color: 0xEF4444 });
    const amberStrobe = new THREE.MeshBasicMaterial({ color: 0xF97316 });

    // Heavy Angular Fortress Base (0-10m)
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.width, 10, b.depth), stealthArmor);
    base.position.y = 5;
    base.castShadow = true;
    g.add(base);

    // 4 Corner Bastion Watchtowers with Red Rotating Strobes
    const cornerOffset = b.width * 0.45;
    [[-cornerOffset, -cornerOffset], [cornerOffset, -cornerOffset], [-cornerOffset, cornerOffset], [cornerOffset, cornerOffset]].forEach(([bx, bz]) => {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 12, 8), stealthArmor);
      turret.position.set(bx, 6, bz);
      g.add(turret);

      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), redHazard);
      strobe.position.set(bx, 12.3, bz);
      g.add(strobe);
    });

    // Central Vault Tower with Red Policy Glow Channels (10-28m)
    const vaultTower = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, 18, b.depth * 0.7), stealthArmor);
    vaultTower.position.y = 19;
    g.add(vaultTower);

    // Vertical Red Glowing Policy Channels
    [-1.8, 0, 1.8].forEach(px => {
      const channel = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 16), redHazard);
      channel.position.set(px, 19, (b.depth * 0.35) + 0.05);
      g.add(channel);
    });

    // Floating Red Holographic Containment Ring
    const shieldRing = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.12, 8, 32), redHazard);
    shieldRing.rotation.x = Math.PI / 2;
    shieldRing.position.y = 29.5;
    shieldRing.userData = { rotSpeed: -0.45 };
    g.add(shieldRing);
  }

  // --- 7. Cloud Release Dock (Sora Takahashi - DevOps & SRE Lead) ---
  private static buildReleaseDock(g: THREE.Group, b: Building): void {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const yellowCrane = new THREE.MeshStandardMaterial({ color: 0xEAB308, metalness: 0.7, roughness: 0.4 });
    const steelCable = new THREE.MeshBasicMaterial({ color: 0x94A3B8 });

    // Concrete Freight Loading Platform (0-3m)
    const dock = new THREE.Mesh(new THREE.BoxGeometry(b.width + 2, 3, b.depth + 2), concrete);
    dock.position.y = 1.5;
    dock.receiveShadow = true;
    g.add(dock);

    // Container Terminal Office Tower (3-18m)
    const office = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.5, 15, b.depth * 0.5), concrete);
    office.position.set(-b.width * 0.25, 10.5, -b.depth * 0.25);
    g.add(office);

    // Stacked OCI Shipping Containers (Docker Blue, Kubernetes Cyan, Rust Orange)
    const containerColors = [0x0284C7, 0x06B6D4, 0xEA580C, 0x10B981, 0x3B82F6];
    const containerCoords = [
      [2.5, 3.8, -2.0, 0],
      [2.5, 3.8, 1.8, 0],
      [2.5, 5.4, -0.1, 0], // Tier 2
      [-1.5, 3.8, 2.8, Math.PI / 2]
    ];

    containerCoords.forEach(([cx, cy, cz, rot], idx) => {
      const cMat = new THREE.MeshStandardMaterial({ color: containerColors[idx % containerColors.length], metalness: 0.6, roughness: 0.4 });
      const containerBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 4.8), cMat);
      containerBox.position.set(cx, cy, cz);
      containerBox.rotation.y = rot;
      containerBox.castShadow = true;
      g.add(containerBox);
    });

    // Massive Overhead Industrial Gantry Crane
    // Vertical Legs
    [-4.5, 4.5].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 18, 0.4), yellowCrane);
      leg.position.set(lx, 9, 3.8);
      g.add(leg);
    });

    // Horizontal Crane Bridge Beam
    const gantryBeam = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.8, 0.8), yellowCrane);
    gantryBeam.position.set(0, 18, 3.8);
    g.add(gantryBeam);

    // Crane Trolley & Cable Spreader
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), yellowCrane);
    trolley.position.set(1.5, 17.4, 3.8);
    g.add(trolley);

    const hoistCable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 6.0), steelCable);
    hoistCable.position.set(1.5, 14.4, 3.8);
    g.add(hoistCable);

    const spreader = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 1.0), yellowCrane);
    spreader.position.set(1.5, 11.4, 3.8);
    g.add(spreader);

    // Satellite Dish on Office Roof
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xF8FAFC }));
    dish.rotation.x = -Math.PI * 0.6;
    dish.position.set(-b.width * 0.25, 19.5, -b.depth * 0.25);
    g.add(dish);
  }

  // --- 8. Civic Medical Trauma Center (Dr. Sarah Miller - Medical Director) ---
  private static buildTraumaCenter(g: THREE.Group, b: Building): void {
    const surgicalWhite = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, metalness: 0.3, roughness: 0.3 });
    const hospitalGlass = new THREE.MeshPhysicalMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.6, roughness: 0.1 });
    const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xEF4444 });
    const helipadMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.8 });

    // Multi-wing Hospital Complex (0-18m)
    // Main Ward Wing
    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(b.width, 18, b.depth * 0.65), surgicalWhite);
    mainWing.position.set(0, 9, -b.depth * 0.15);
    mainWing.castShadow = true;
    g.add(mainWing);

    // Emergency Triage Wing
    const triageWing = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, 10, b.depth * 0.5), surgicalWhite);
    triageWing.position.set(-b.width * 0.15, 5, b.depth * 0.25);
    g.add(triageWing);

    // Ribbon Medical Windows
    for (let fl = 1; fl <= 3; fl++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(b.width * 0.9, 1.6), hospitalGlass);
      win.position.set(0, fl * 4.2, (b.depth * 0.65) / 2 - b.depth * 0.15 + 0.05);
      g.add(win);
    }

    // Glowing 3D Red Cross on Facade
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.1), redCrossMat);
    crossV.position.set(0, 14, (b.depth * 0.65) / 2 - b.depth * 0.15 + 0.1);
    g.add(crossV);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.1), redCrossMat);
    crossH.position.set(0, 14, (b.depth * 0.65) / 2 - b.depth * 0.15 + 0.1);
    g.add(crossH);

    // Rooftop Emergency Helipad
    const helipad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 24), helipadMat);
    helipad.position.set(0, 18.2, -b.depth * 0.15);
    g.add(helipad);

    // Helipad Yellow "H" Landing Target
    const hBarMat = new THREE.MeshBasicMaterial({ color: 0xFACC15 });
    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2.6), hBarMat);
    h1.rotation.x = -Math.PI / 2;
    h1.position.set(-0.8, 18.4, -b.depth * 0.15);
    g.add(h1);

    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2.6), hBarMat);
    h2.rotation.x = -Math.PI / 2;
    h2.position.set(0.8, 18.4, -b.depth * 0.15);
    g.add(h2);

    const hMid = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), hBarMat);
    hMid.rotation.x = -Math.PI / 2;
    hMid.position.set(0, 18.4, -b.depth * 0.15);
    g.add(hMid);
  }

  // --- 9. Diagnostic Core (Dr. Aaron Chen - Root Cause Specialist) ---
  private static buildDiagnosticCore(g: THREE.Group, b: Building): void {
    const graphiteMat = new THREE.MeshStandardMaterial({ color: 0x18181B, metalness: 0.8, roughness: 0.3 });
    const reactorGlass = new THREE.MeshPhysicalMaterial({ color: 0xF472B6, transparent: true, opacity: 0.45, roughness: 0.1 });
    const plasmaMagenta = new THREE.MeshBasicMaterial({ color: 0xEC4899 });
    const wireCore = new THREE.MeshBasicMaterial({ color: 0xF43F5E, wireframe: true });

    // Octagonal Diagnostic Lab Base (0-8m)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(b.width * 0.55, b.width * 0.6, 8, 8), graphiteMat);
    base.position.y = 4;
    g.add(base);

    // Central Glass Reactor Containment Cylinder (8-20m)
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 12, 20), reactorGlass);
    chamber.position.y = 14;
    g.add(chamber);

    // Inside Chamber: Glowing Floating Plasma Diagnostic Core
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 1), wireCore);
    core.position.y = 14;
    core.userData = { rotSpeed: 0.9 };
    g.add(core);

    const innerPulse = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16), plasmaMagenta);
    innerPulse.position.y = 14;
    g.add(innerPulse);

    // Orbiting Diagnostic Sensor Ring
    const diagRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 28), plasmaMagenta);
    diagRing.rotation.x = Math.PI / 4;
    diagRing.position.y = 14;
    diagRing.userData = { rotSpeed: -0.85 };
    g.add(diagRing);

    // Rooftop Telemetry Arrays
    const roofCap = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 1.5, 8), graphiteMat);
    roofCap.position.y = 20.8;
    g.add(roofCap);

    for (let ant = 0; ant < 4; ant++) {
      const angle = (ant * Math.PI) / 2;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 4.0), new THREE.MeshStandardMaterial({ color: 0xE2E8F0 }));
      mast.position.set(Math.cos(angle) * 1.8, 23.0, Math.sin(angle) * 1.8);
      g.add(mast);
    }
  }

  // --- 10. Citadel Spire (Alex Vance - Master Orchestrator) ---
  private static buildCitadelSpire(g: THREE.Group, b: Building): void {
    const sapphireSteel = new THREE.MeshStandardMaterial({ color: 0x0F172A, metalness: 0.85, roughness: 0.25 });
    const executiveGlass = new THREE.MeshPhysicalMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.55, roughness: 0.1 });
    const goldTrim = new THREE.MeshStandardMaterial({ color: 0xF59E0B, metalness: 0.9, roughness: 0.2 });

    // Tier 1: Monumental Colonnade Grand Entrance (0-14m)
    const base = new THREE.Mesh(new THREE.BoxGeometry(13, 14, 13), sapphireSteel);
    base.position.y = 7;
    base.castShadow = true;
    g.add(base);

    // 8 Grand Colonnade Pillars
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14.2, 0.6), goldTrim);
      col.position.set(i * 2.8, 7.1, 6.55);
      g.add(col);
    }

    // Tier 2: Stepped Mid-Tower (14-28m)
    const midTower = new THREE.Mesh(new THREE.BoxGeometry(9.5, 14, 9.5), executiveGlass);
    midTower.position.y = 21;
    g.add(midTower);

    // Tier 3: Executive Command Observation Deck (28-40m)
    const topDeck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 12, 6.8), executiveGlass);
    topDeck.position.y = 34;
    g.add(topDeck);

    // Crown Spire: 18-Meter Communications Needle (40-58m)
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.4, 18.0, 8), goldTrim);
    needle.position.y = 49;
    g.add(needle);

    // Pulsing Aviation Beacon at Tip
    const aviationBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0xEF4444 }));
    aviationBeacon.position.y = 58.2;
    g.add(aviationBeacon);

    // Orbiting Master Hologram Ring
    const masterRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.12, 8, 36), new THREE.MeshBasicMaterial({ color: 0x38BDF8 }));
    masterRing.rotation.x = Math.PI / 2;
    masterRing.position.y = 42;
    masterRing.userData = { rotSpeed: 0.35 };
    g.add(masterRing);
  }

  // --- 11. Civic Construction Yard (Harlan Drake - Construction Lead) ---
  private static buildConstructionYard(g: THREE.Group, b: Building): void {
    const rawConcrete = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.95 });
    const craneYellow = new THREE.MeshStandardMaterial({ color: 0xFACC15, metalness: 0.6, roughness: 0.4 });
    const steelOrange = new THREE.MeshStandardMaterial({ color: 0xEA580C, metalness: 0.7 });

    // Excavated Foundation Slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.width, 1.2, b.depth), rawConcrete);
    slab.position.y = 0.6;
    g.add(slab);

    // Exposed Unfinished Reinforced Concrete Columns with Rebar
    [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.0, 9.0, 1.0), rawConcrete);
      col.position.set(cx, 5.5, cz);
      g.add(col);

      // Steel rebar extending from top
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5), steelOrange);
      rebar.position.set(cx, 11.2, cz);
      g.add(rebar);
    });

    // Tubular Steel Scaffolding Frame
    const scaffoldMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, metalness: 0.8 });
    const scaffold = new THREE.Mesh(new THREE.BoxGeometry(4.5, 8.0, 0.4), scaffoldMat);
    scaffold.position.set(0, 5.0, b.depth / 2 + 0.2);
    g.add(scaffold);

    // Full Yellow Lattice Tower Crane (24 Meters High!)
    // Mast
    const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 22, 0.8), craneYellow);
    craneMast.position.set(b.width * 0.4, 11, -b.depth * 0.4);
    g.add(craneMast);

    // Horizontal Jib Arm (20m long)
    const jib = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 0.6), craneYellow);
    jib.position.set(b.width * 0.4 - 5.0, 22.3, -b.depth * 0.4);
    g.add(jib);

    // Counter-Jib & Concrete Counterweight Blocks
    const counterJib = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.6, 0.6), craneYellow);
    counterJib.position.set(b.width * 0.4 + 3.0, 22.3, -b.depth * 0.4);
    g.add(counterJib);

    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), rawConcrete);
    counterweight.position.set(b.width * 0.4 + 5.0, 22.3, -b.depth * 0.4);
    g.add(counterweight);

    // Hoist Cable & Hook
    const hoistWire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 10.0), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hoistWire.position.set(b.width * 0.4 - 8.0, 17.3, -b.depth * 0.4);
    g.add(hoistWire);

    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), steelOrange);
    hook.position.set(b.width * 0.4 - 8.0, 12.0, -b.depth * 0.4);
    g.add(hook);
  }

  // --- 12. Surrounding Living Urban Blocks (Townhouses & Commercial) ---
  private static buildUrbanLivingBlock(g: THREE.Group, b: Building): void {
    const facadeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(b.facadeColor || '#2563EB'),
      roughness: 0.6,
      metalness: 0.2
    });
    const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xFEF08A }); // Warm amber interior light
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.7 });
    const awningMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.accentColor || '#3B82F6'), roughness: 0.8 });

    // Main multi-floor building body
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.width, b.height, b.depth), facadeMat);
    body.position.y = b.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Ground Floor Commercial Storefront with Awnings
    const awning = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.85, 0.25, 1.2), awningMat);
    awning.position.set(0, 3.2, b.depth / 2 + 0.6);
    awning.rotation.x = 0.15;
    g.add(awning);

    const shopWindow = new THREE.Mesh(new THREE.PlaneGeometry(b.width * 0.8, 2.2), windowGlowMat);
    shopWindow.position.set(0, 1.5, b.depth / 2 + 0.05);
    g.add(shopWindow);

    // Upper Floors: Individual Windows with Warm Illumination
    const floors = Math.max(2, Math.floor(b.height / 3.2));
    for (let f = 1; f < floors; f++) {
      const yPos = f * 3.2 + 1.2;
      if (yPos > b.height - 1.5) break;

      [-b.width * 0.25, b.width * 0.25].forEach(wx => {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), windowGlowMat);
        win.position.set(wx, yPos, b.depth / 2 + 0.05);
        g.add(win);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.15), frameMat);
        frame.position.set(wx, yPos - 0.7, b.depth / 2 + 0.08);
        g.add(frame);
      });
    }

    // Rooftop Details: HVAC Units and Wooden Water Towers
    if (b.height > 12) {
      // Rooftop HVAC Compressor Unit
      const hvac = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.2, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 })
      );
      hvac.position.set(-1.5, b.height + 0.6, 0);
      g.add(hvac);

      // Water Tower on Stilts
      const stiltMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });
      const woodTankMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.9 });

      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12), woodTankMat);
      tank.position.set(1.8, b.height + 2.5, 0);
      g.add(tank);

      const roofCone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.0, 12), woodTankMat);
      roofCone.position.set(1.8, b.height + 4.1, 0);
      g.add(roofCone);

      const stilts = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 1.4, 4), stiltMat);
      stilts.position.set(1.8, b.height + 0.7, 0);
      g.add(stilts);
    }
  }
}
