import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Box } from './PlayerController';
import { Building, Intersection, RoadSegment, Vehicle } from '../../simulation/types';
import { BLOCK_INNER_HALF, DistrictZone, districtZones } from '../../simulation/districts';

/**
 * City realism layer: physical sky + lighting, street surfaces and markings, dense downtown blocks,
 * street furniture and real car models (Kenney City Kit / Car Kit, CC0, in public/models/kenney).
 * Static models are merged into one mesh per asset pack, so the whole skyline costs a few draw calls.
 */

const ROAD_W = 5.2;
const MODEL_BASE = '/models/kenney';
const PH_BASE = '/textures/polyhaven';

// ------------------------------------------------------------------------------------------------
// Photo-scanned PBR textures (Poly Haven, CC0)

const texLoaderPBR = new THREE.TextureLoader();
function loadPBR(name: string, mat: THREE.MeshStandardMaterial, normalScale = 1): void {
  const load = (suffix: string, srgb: boolean) => texLoaderPBR.loadAsync(`${PH_BASE}/${name}_${suffix}_1k.jpg`).then(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  });
  Promise.all([load('diff', true), load('nor_gl', false), load('rough', false)]).then(([map, normal, rough]) => {
    mat.map = map;
    mat.normalMap = normal;
    mat.normalScale.set(normalScale, normalScale);
    mat.roughnessMap = rough;
    mat.roughness = 1;
    mat.color.set(0xFFFFFF);
    mat.needsUpdate = true;
  }).catch(err => console.warn(`PBR texture ${name} not loaded; keeping the procedural one`, err));
}

let grassMat: THREE.MeshStandardMaterial | null = null;
/** Shared lawn/hill material: photo-scanned grass (procedural texture until it loads). */
export function getGrassMaterial(): THREE.MeshStandardMaterial {
  if (!grassMat) {
    grassMat = new THREE.MeshStandardMaterial({ map: noiseTexture('#3E6A2B', '#253F18', 256, 6000, 0.35), roughness: 0.97 });
    grassMat.color.set(0xD8E8C8);   // the scanned grass is bright; keep lawns a natural mid-green
    loadPBR('leafy_grass', grassMat, 0.8);
  }
  return grassMat;
}

// ------------------------------------------------------------------------------------------------
// Atmosphere

/** Materials that glow at night (building windows, street lamp bulbs) and their full-night intensity. */
export const nightGlow: { material: THREE.MeshStandardMaterial; max: number }[] = [];

/**
 * The district workplaces are mostly metal, which shows only reflections: under a black night sky they turned
 * into black holes around the plaza. At night their own colour glows softly (glass brighter, like lit floors).
 */
export function addFacadeNightGlow(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial;
      if (seen.has(m) || !std.isMeshStandardMaterial || std.emissive.getHex() !== 0 || std.emissiveMap) continue;
      seen.add(m);
      std.emissive.copy(std.color);
      std.emissiveIntensity = 0;
      const glass = std.transparent && std.opacity < 0.9;
      nightGlow.push({ material: std, max: glass ? 0.55 : 0.16 });
    }
  });
}

export interface Atmosphere {
  /** Moves sun/moon, sky, lights, fog and night glow to `hour` (0-24, local time). */
  setHour: (hour: number) => void;
  /** 0 in daylight .. 1 at night (drives bloom). */
  night: () => number;
  /** Called after the lighting changed (also when the photographed sky finishes loading). */
  onChange: (fn: () => void) => void;
  /** Called after the environment (reflection) texture was swapped, e.g. day sky photo <-> night sky. */
  onEnvChange: (fn: () => void) => void;
  dispose: () => void;
}

const lerpColor = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

/**
 * Physical sky + sun with a real day cycle. Daytime is deep blue with warm, low afternoon light and
 * strong shadows; after sunset the sky darkens, a cool moon takes over and windows/street lamps glow.
 */
export function createAtmosphere(
  scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  sun: THREE.DirectionalLight, ambient: THREE.AmbientLight, hemi: THREE.HemisphereLight,
): Atmosphere {
  // Neutral tone mapping keeps colours saturated (filmic curves wash pastel scenes out)
  renderer.toneMapping = THREE.NeutralToneMapping;

  const makeSky = () => {
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 2.0;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.86;
    return sky;
  };
  const sky = makeSky();
  scene.add(sky);
  scene.background = null;
  const envSky = makeSky();
  const envScene = new THREE.Scene();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let env: THREE.Texture | null = null;
  let lastEnvHour = -99;

  // Photographed cloudy sky (Poly Haven HDRI) for daytime; the sun light is aimed at the sun in the photo.
  let hdr: { tex: THREE.Texture; env: THREE.Texture; sunDir: THREE.Vector3 } | null = null;
  let usingHdr = false;
  let lastHour = 12;
  let lastNight = 0;
  let onChange: (() => void) | null = null;
  let onEnvChange: (() => void) | null = null;
  new HDRLoader().loadAsync(`${PH_BASE}/kloofendal_48d_partly_cloudy_puresky_2k.hdr`).then(tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    hdr = { tex, env: pmrem.fromEquirectangular(tex).texture, sunDir: hdrSunDirection(tex) };
    apply(lastHour);
  }).catch(err => console.warn('HDR sky not loaded; using the procedural sky', err));
  scene.fog = new THREE.Fog(0xAFC6DE, 170, 620);

  ambient.intensity = 0.04;
  // reflections everywhere at full strength tinted the whole city blue: keep them subtle
  (scene as any).environmentIntensity = 0.38;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;

  const setHour = (hour: number) => {
    lastHour = hour;
    // sunrise 6:00, sunset 18:45; elevation peaks ~62 degrees at midday
    const dayFrac = (hour - 6) / 12.75;
    const elev = Math.sin(dayFrac * Math.PI) * (62 * Math.PI / 180);
    const az = dayFrac * Math.PI;                       // east (+x) -> west (-x)
    const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), 0.55 * Math.cos(elev)).normalize();
    const d = Math.max(0, Math.min(1, Math.sin(elev) * 4));            // 0 night .. 1 day
    const golden = d * Math.max(0, Math.min(1, 1 - Math.sin(elev) * 2.6));   // low sun

    for (const s of [sky, envSky]) s.material.uniforms.sunPosition.value.copy(sunDir);

    // full daylight: switch to the photographed sky
    const wantHdr = !!hdr && d > 0.6 && golden < 0.25;
    if (wantHdr && hdr) {
      usingHdr = true;
      sky.visible = false;
      scene.background = hdr.tex;
      (scene as any).backgroundIntensity = 1.0;
      (scene as any).environmentIntensity = 0.6;
      scene.environment = hdr.env;
      sun.position.copy(hdr.sunDir).multiplyScalar(200);
      sun.color.set(0xFFF2E0);
      sun.intensity = 3.6;
      hemi.color.set(0xC6D8EE);
      hemi.groundColor.set(0x5B4A38);
      hemi.intensity = 0.34;
      renderer.toneMappingExposure = 0.88;
      (scene.fog as THREE.Fog).color.set(0xBCCFE2);
      for (const g of nightGlow) g.material.emissiveIntensity = 0;
      lastNight = 0;
      onChange?.();
      return;
    }
    if (usingHdr) { usingHdr = false; sky.visible = true; scene.background = null; lastEnvHour = -99; (scene as any).environmentIntensity = 0.38; }

    if (d > 0.02) {
      sun.position.copy(sunDir).multiplyScalar(200);
      sun.color.copy(lerpColor(0xFFF1DE, 0xFF9A4D, golden));
      sun.intensity = 0.4 + 3.4 * d;
    } else {
      // moonlight from the opposite side of the sky
      sun.position.set(-sunDir.x * 200, 150, -sunDir.z * 200 + 60);
      sun.color.set(0xA9BFF0);
      sun.intensity = 1.1;
    }
    hemi.color.copy(lerpColor(0x4A5F96, 0xC3D6EE, d));
    hemi.groundColor.copy(lerpColor(0x1A1A24, 0x5B4A38, d));
    hemi.intensity = 0.78 - 0.54 * d;                      // night needs a real fill or people vanish
    renderer.toneMappingExposure = 0.72 + 0.23 * (1 - d);

    const fog = scene.fog as THREE.Fog;
    fog.color.copy(lerpColor(0x16223C, 0xAFC6DE, d)).lerp(new THREE.Color(0xE8B48A), golden * 0.35);

    const night = 1 - d;
    lastNight = night;
    // deep night: a dark navy sky that matches the fog (the physical sky goes pitch black, hiding every skyline)
    const deepNight = d < 0.05;
    sky.visible = !deepNight;
    scene.background = deepNight ? fog.color.clone().multiplyScalar(0.8) : null;
    for (const g of nightGlow) g.material.emissiveIntensity = g.max * night;

    // reflections follow the sky (re-render the small environment map only when the light changed)
    if (Math.abs(hour - lastEnvHour) > 0.2 || !env) {
      const next = pmrem.fromScene(envScene, 0.02).texture;
      scene.environment = next;
      env?.dispose();
      env = next;
      lastEnvHour = hour;
    }
  };

  const apply = (h: number) => {
    const before = scene.environment;
    setHour(h);
    onChange?.();
    if (scene.environment !== before) onEnvChange?.();
  };

  return {
    setHour: (h: number) => apply(h),
    night: () => lastNight,
    onChange: (fn: () => void) => { onChange = fn; },
    onEnvChange: (fn: () => void) => { onEnvChange = fn; },
    dispose: () => {
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      envSky.geometry.dispose();
      (envSky.material as THREE.Material).dispose();
      env?.dispose();
      pmrem.dispose();
      scene.environment = null;
      nightGlow.length = 0;
    },
  };
}

/** Direction of the brightest texel (the sun) in an equirectangular HDR texture. */
function hdrSunDirection(tex: THREE.Texture): THREE.Vector3 {
  const img = tex.image as { data: Uint16Array | Float32Array; width: number; height: number };
  const half = img.data instanceof Uint16Array;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      const r = half ? THREE.DataUtils.fromHalfFloat(img.data[i] as number) : img.data[i];
      const g = half ? THREE.DataUtils.fromHalfFloat(img.data[i + 1] as number) : img.data[i + 1];
      const l = r + g;
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const u = (bx + 0.5) / img.width;
  let v = (by + 0.5) / img.height;
  if (tex.flipY) v = 1 - v;
  const theta = (u - 0.5) * Math.PI * 2;
  let phi = (0.5 - v) * Math.PI;
  if (phi < 0) phi = -phi;                       // the sun is always above the horizon in a sky photo
  phi = Math.max(phi, THREE.MathUtils.degToRad(22));   // keep shadows a sensible length
  return new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(phi), Math.cos(phi) * Math.sin(theta)).normalize();
}

/** Hour of day for a time-of-day setting ('live' follows this computer's clock). */
export function hourFor(setting: string): number {
  if (setting === 'day') return 13;
  if (setting === 'golden') return 17.9;
  if (setting === 'night') return 22;
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

// ------------------------------------------------------------------------------------------------
// Street surfaces

function noiseTexture(base: string, speck: string, size = 256, specks = 2600, alpha = 0.18): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = speck;
  for (let i = 0; i < specks; i++) {
    ctx.globalAlpha = Math.random() * alpha;
    const r = Math.random() * 1.6 + 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let asphaltMat: THREE.MeshStandardMaterial | null = null;
/** Shared textured asphalt for road planes (UVs are scaled per road so the grain stays the same size). */
export function getAsphaltMaterial(): THREE.MeshStandardMaterial {
  if (!asphaltMat) {
    const map = noiseTexture('#2B2F36', '#9AA3AF', 256, 5200, 0.22);
    asphaltMat = new THREE.MeshStandardMaterial({ map, color: 0xFFFFFF, roughness: 0.92, metalness: 0.0 });
    loadPBR('clean_asphalt', asphaltMat, 0.6);
  }
  return asphaltMat;
}

/** Scale a plane's UVs so a repeating texture tiles every `tile` world units. */
export function tileUVs(geo: THREE.BufferGeometry, w: number, h: number, tile = 6) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
  uv.needsUpdate = true;
}

function flatQuad(cx: number, cz: number, w: number, d: number, y: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rotY);
  g.translate(cx, y, cz);
  return g;
}

/** Lane markings, zebra crossings and concrete block lots. Returns the meshes it added. */
export function buildStreetDetail(scene: THREE.Scene, roads: RoadSegment[], intersections: Intersection[], buildings: Building[]): THREE.Object3D[] {
  const added: THREE.Object3D[] = [];
  const yellow: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];

  for (const r of roads) {
    const dx = r.end[0] - r.start[0], dz = r.end[1] - r.start[1];
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const ux = dx / len, uz = dz / len;          // along the road
    const nx = -uz, nz = ux;                      // across the road
    const mx = (r.start[0] + r.end[0]) / 2, mz = (r.start[1] + r.end[1]) / 2;
    const inner = len - 2 * 6.2;                  // stop short of the crossings at both ends
    if (inner <= 1) continue;
    // double yellow centre line
    for (const off of [-0.13, 0.13]) yellow.push(flatQuad(mx + nx * off, mz + nz * off, inner, 0.1, 0.035, -ang));
    // white edge lines
    for (const off of [-2.3, 2.3]) white.push(flatQuad(mx + nx * off, mz + nz * off, inner, 0.1, 0.035, -ang));
    // stop bars before each crossing (right-hand traffic: the lane on the right of travel)
    for (const [ex, ez, sgn] of [[r.start[0], r.start[1], 1], [r.end[0], r.end[1], -1]] as [number, number, number][]) {
      const bx = ex + ux * sgn * 6.1, bz = ez + uz * sgn * 6.1;
      const side = -sgn;   // lane approaching this end
      white.push(flatQuad(bx + nx * side * 1.2, bz + nz * side * 1.2, 0.35, 2.2, 0.035, -ang));
    }
  }

  // zebra crossings on every approach of every intersection
  for (const it of intersections) {
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const hasRoad = roads.some(r =>
        (r.start[0] === it.x && r.start[1] === it.z && Math.sign(r.end[0] - it.x) === ax && Math.sign(r.end[1] - it.z) === az) ||
        (r.end[0] === it.x && r.end[1] === it.z && Math.sign(r.start[0] - it.x) === ax && Math.sign(r.start[1] - it.z) === az));
      if (!hasRoad) continue;
      const cx = it.x + ax * 4.6, cz = it.z + az * 4.6;
      for (let k = -4; k <= 4; k++) {
        const off = k * 0.55;
        if (ax !== 0) white.push(flatQuad(cx, cz + off, 1.8, 0.3, 0.036));
        else white.push(flatQuad(cx + off, cz, 0.3, 1.8, 0.036));
      }
    }
  }

  const lineMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [geos, color] of [[yellow, 0xD9AC2C], [white, 0xD6D6D0]] as [THREE.BufferGeometry[], number][]) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos), lineMat(color));
    m.receiveShadow = true;
    geos.forEach(g => g.dispose());
    scene.add(m);
    added.push(m);
  }

  // block lots: concrete under the downtown blocks, grass lawns around the workplaces
  const xs = [...new Set(intersections.map(i => i.x))].sort((a, b) => a - b);
  const zs = [...new Set(intersections.map(i => i.z))].sort((a, b) => a - b);
  const concrete: THREE.BufferGeometry[] = [];
  const grass: THREE.BufferGeometry[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const g = flatQuad(cx, cz, BLOCK_INNER_HALF * 2 + 1.4, BLOCK_INNER_HALF * 2 + 1.4, 0.012);
      (isDowntownBlock(cx, cz, buildings) ? concrete : grass).push(g);
    }
  }
  const lotMesh = (geos: THREE.BufferGeometry[], map: THREE.Texture) => {
    if (!geos.length) return;
    map.repeat.set(4, 4);
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map, roughness: 0.97 }));
    m.receiveShadow = true;
    geos.forEach(g => g.dispose());
    scene.add(m);
    added.push(m);
  };
  lotMesh(concrete, noiseTexture('#8C857B', '#4A453E', 256, 3200, 0.18));
  if (grass.length) {
    for (const g of grass) tileUVs(g, BLOCK_INNER_HALF * 2 + 1.4, BLOCK_INNER_HALF * 2 + 1.4, 8);
    const m = new THREE.Mesh(mergeGeometries(grass), getGrassMaterial());
    m.receiveShadow = true;
    grass.forEach(g => g.dispose());
    scene.add(m);
    added.push(m);
  }
  return added;
}

// ------------------------------------------------------------------------------------------------
// Kenney model loading

interface ModelPart { geometry: THREE.BufferGeometry; material: THREE.Material; name: string }
interface LoadedModel { parts: ModelPart[]; size: THREE.Vector3; min: THREE.Vector3; scene: THREE.Object3D }

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<LoadedModel>>();

function loadModel(path: string): Promise<LoadedModel> {
  let p = modelCache.get(path);
  if (!p) {
    p = loader.loadAsync(`${MODEL_BASE}/${path}`).then(gltf => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const parts: ModelPart[] = [];
      root.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        if (g.attributes.tangent) g.deleteAttribute('tangent');
        parts.push({ geometry: g, material: m.material as THREE.Material, name: m.name });
      });
      const box = new THREE.Box3().setFromObject(root);
      return { parts, size: box.getSize(new THREE.Vector3()), min: box.min.clone(), scene: root };
    });
    modelCache.set(path, p);
  }
  return p;
}

/** Collects transformed geometry per material and merges it into one mesh per material at the end. */
class StaticBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private packMaterial = new Map<string, THREE.Material>();

  add(model: LoadedModel, pack: string, matrix: THREE.Matrix4, opts: { map?: THREE.Texture; glow?: THREE.Texture | null } = {}) {
    for (const part of model.parts) {
      // every model in a Kenney pack uses the same colormap texture: share one material per pack/variant
      let mat = this.packMaterial.get(pack);
      if (!mat) {
        mat = part.material;
        const std = (mat as THREE.MeshStandardMaterial).clone();
        if (std.isMeshStandardMaterial) {
          std.envMapIntensity = 0.6;
          std.roughness = Math.min(std.roughness ?? 1, 0.8);
          std.color.setScalar(0.82);   // Kenney's white roofs/facades read as blown-out under full sun
          if (opts.map) std.map = opts.map;
          if (opts.glow) {
            std.emissive = new THREE.Color(0xFFFFFF);
            std.emissiveMap = opts.glow;
            std.emissiveIntensity = 0;
            nightGlow.push({ material: std, max: 1.25 });
          }
        }
        mat = std;
        this.packMaterial.set(pack, mat);
      }
      const g = part.geometry.clone();
      g.applyMatrix4(matrix);
      const list = this.buckets.get(mat) || [];
      list.push(g);
      this.buckets.set(mat, list);
    }
  }

  build(scene: THREE.Scene): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.buckets.forEach((geos, mat) => {
      const indexed = geos.every(g => g.index);
      const merged = mergeGeometries(indexed ? geos : geos.map(g => (g.index ? g.toNonIndexed() : g)));
      geos.forEach(g => g.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshes.push(mesh);
    });
    return meshes;
  }
}

/** A block is "downtown" when it only holds plain residential/commercial blocks (no workplace). */
export function isDowntownBlock(cx: number, cz: number, buildings: Building[]): boolean {
  const inBlock = buildings.filter(b => Math.abs(b.x - cx) < BLOCK_INNER_HALF && Math.abs(b.z - cz) < BLOCK_INNER_HALF);
  return inBlock.length > 0 && inBlock.every(b => b.id.startsWith('bld-block-'));
}

/** Night-time window glow: the blue window/glass areas of the Kenney colormap become warm light. */
function windowGlowMap(map: THREE.Texture): THREE.Texture | null {
  const img = map.image as CanvasImageSource & { width: number; height: number };
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const isWindow = b > 120 && b > r + 30 && b > g + 8;
    px[i] = isWindow ? 255 : 0; px[i + 1] = isWindow ? 206 : 0; px[i + 2] = isWindow ? 140 : 0; px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = map.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = map.magFilter;
  t.minFilter = map.minFilter;
  return t;
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B);
  x ^= x >>> 13;
  x = Math.imul(x, 0xC2B2AE35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const TALL = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e', 'building-l', 'building-m', 'building-n'];
const MID = ['building-f', 'building-g', 'building-i', 'building-j', 'building-k', 'building-l', 'building-h'];
const LOW = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-h'];

export interface DressResult {
  obstacles: Box[];               // new collision boxes (downtown buildings, poles, signs)
  hiddenBuildingIds: string[];    // plain blocks replaced by real buildings
  zones: DistrictZone[];
  lamps: THREE.Vector3[];         // street lamp bulb positions (real light pools are placed at the nearest ones)
  dispose: () => void;
}

/**
 * Loads the Kenney models and dresses the city. Plain residential/commercial blocks become dense
 * clusters of real buildings; every street gets lamps; intersections get traffic lights; the five
 * districts get tinted lots and monument signs.
 */
export async function dressCity(
  scene: THREE.Scene,
  buildings: Building[],
  roads: RoadSegment[],
  intersections: Intersection[],
  keepClear: { x: number; z: number; r: number }[],
): Promise<DressResult> {
  const obstacles: Box[] = [];
  const hidden: string[] = [];
  const disposables: THREE.Object3D[] = [];
  const batch = new StaticBatch();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const xs = [...new Set(intersections.map(i => i.x))].sort((a, b) => a - b);
  const zs = [...new Set(intersections.map(i => i.z))].sort((a, b) => a - b);

  // --- downtown blocks -------------------------------------------------------------------------
  const lots: { cx: number; cz: number; tier: string[]; seed: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const inBlock = buildings.filter(b => Math.abs(b.x - cx) < BLOCK_INNER_HALF && Math.abs(b.z - cz) < BLOCK_INNER_HALF);
      if (!inBlock.length || !inBlock.every(b => b.id.startsWith('bld-block-'))) continue;
      if (keepClear.some(k => Math.abs(k.x - cx) < BLOCK_INNER_HALF + k.r && Math.abs(k.z - cz) < BLOCK_INNER_HALF + k.r)) continue;
      hidden.push(...inBlock.map(b => b.id));
      const suburban = inBlock.every(b => b.type === 'HOUSE');
      const dist = Math.hypot(cx, cz);
      const tier = suburban ? LOW : dist < 45 ? TALL : dist < 75 ? MID : LOW;
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lots.push({ cx: cx + ox * 4.95, cz: cz + oz * 4.95, tier, seed: i * 97 + j * 13 + (ox + 2) * 3 + (oz + 2) });
      }
    }
  }
  const commercialNames = [...new Set(lots.map(l => l.tier[Math.floor(hash(l.seed) * l.tier.length)]))];
  const commercial = new Map<string, LoadedModel>();
  await Promise.all(commercialNames.map(async n => commercial.set(n, await loadModel(`commercial/${n}.glb`))));

  // facade colour variants: Kenney's white, sandstone and red-brick textures, mixed across the skyline
  const firstMap = ([...commercial.values()][0]?.parts[0]?.material as THREE.MeshStandardMaterial | undefined)?.map || null;
  const glow = firstMap ? windowGlowMap(firstMap) : null;
  const texLoader = new THREE.TextureLoader();
  const variantMaps: (THREE.Texture | undefined)[] = [undefined];
  for (const v of ['variation-a', 'variation-b']) {
    try {
      const t = await texLoader.loadAsync(`${MODEL_BASE}/commercial/Textures/${v}.png`);
      if (firstMap) { t.flipY = firstMap.flipY; t.magFilter = firstMap.magFilter; t.minFilter = firstMap.minFilter; t.wrapS = firstMap.wrapS; t.wrapT = firstMap.wrapT; }
      t.colorSpace = THREE.SRGBColorSpace;
      variantMaps.push(t);
    } catch { /* keep the default colours */ }
  }

  for (const lot of lots) {
    const name = lot.tier[Math.floor(hash(lot.seed) * lot.tier.length)];
    const model = commercial.get(name)!;
    const variant = Math.floor(hash(lot.seed + 31) * variantMaps.length);
    const turn = Math.floor(hash(lot.seed + 7) * 4);
    const fx = turn % 2 ? model.size.z : model.size.x;
    const fz = turn % 2 ? model.size.x : model.size.z;
    const s = 8.8 / Math.max(fx, fz);
    q.setFromAxisAngle(up, turn * Math.PI / 2);
    m4.compose(new THREE.Vector3(lot.cx, 0, lot.cz), q, new THREE.Vector3(s, s, s));
    batch.add(model, `commercial-${variant}`, m4, { map: variantMaps[variant], glow });
    obstacles.push({
      minX: lot.cx - (fx * s) / 2, maxX: lot.cx + (fx * s) / 2,
      minZ: lot.cz - (fz * s) / 2, maxZ: lot.cz + (fz * s) / 2,
      height: model.size.y * s,
    });
  }

  // --- street lights along both sidewalks ------------------------------------------------------
  const lamp = await loadModel('roads/light-curved.glb');
  const bulbs: THREE.Vector3[] = [];
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const LAMP_S = 10.5;
  for (const r of roads) {
    const dx = r.end[0] - r.start[0], dz = r.end[1] - r.start[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    for (let t = 9; t <= len - 9; t += 19) {
      for (const side of [-1, 1]) {
        const px = r.start[0] + ux * t + nx * side * 3.55;
        const pz = r.start[1] + uz * t + nz * side * 3.55;
        if (keepClear.some(k => Math.hypot(k.x - px, k.z - pz) < k.r)) continue;
        if (obstacles.some(b => px > b.minX - 0.5 && px < b.maxX + 0.5 && pz > b.minZ - 0.5 && pz < b.maxZ + 0.5)) continue;
        // the lamp's arm points along local -Z: turn it toward the road centre
        const tx = -nx * side, tz = -nz * side;
        q.setFromAxisAngle(up, Math.atan2(-tx, -tz));
        m4.compose(new THREE.Vector3(px, 0.16, pz), q, new THREE.Vector3(LAMP_S, LAMP_S, LAMP_S));
        batch.add(lamp, 'roads', m4);
        obstacles.push({ minX: px - 0.3, maxX: px + 0.3, minZ: pz - 0.3, maxZ: pz + 0.3, height: 7.5 });
        bulbs.push(new THREE.Vector3(px + tx * 0.19 * LAMP_S, 0.16 + 0.56 * LAMP_S, pz + tz * 0.19 * LAMP_S));
      }
    }
    // street trees halfway between lamps, on the outer edge of the sidewalk
    for (let t = 18.5; t <= len - 9; t += 19) {
      for (const side of [-1, 1]) {
        const px = r.start[0] + ux * t + nx * side * 3.75;
        const pz = r.start[1] + uz * t + nz * side * 3.75;
        if (keepClear.some(k => Math.hypot(k.x - px, k.z - pz) < k.r)) continue;
        if (obstacles.some(b => px > b.minX - 1 && px < b.maxX + 1 && pz > b.minZ - 1 && pz < b.maxZ + 1)) continue;
        treeSpots.push({ x: px, z: pz, s: 0.9 + hash(Math.round(px * 7 + pz * 13)) * 0.35 });
      }
    }
  }

  // lawn trees around the workplace blocks (kept to the edge of the lawn, clear of buildings)
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (isDowntownBlock(cx, cz, buildings)) continue;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + hash(i * 31 + j * 7) * 0.6;
        const px = cx + Math.cos(a) * 8.6, pz = cz + Math.sin(a) * 8.6;
        const clear = buildings.every(b => b.type === 'PARK_SPACE' || Math.abs(px - b.x) > b.width / 2 + 2.2 || Math.abs(pz - b.z) > b.depth / 2 + 2.2);
        if (!clear || keepClear.some(c => Math.hypot(c.x - px, c.z - pz) < c.r)) continue;
        treeSpots.push({ x: px, z: pz, s: 0.8 + hash(k * 17 + i * 3 + j) * 0.5 });
      }
    }
  }

  // --- traffic lights on two corners of every 4-way crossing --------------------------------------
  const signal = await loadModel('roads/traffic-light.glb');
  for (const it of intersections) {
    const degree = roads.filter(r => (r.start[0] === it.x && r.start[1] === it.z) || (r.end[0] === it.x && r.end[1] === it.z)).length;
    if (degree < 3) continue;
    for (const [cx, cz] of [[1, 1], [-1, -1]]) {
      const px = it.x + cx * 3.75, pz = it.z + cz * 3.75;
      if (keepClear.some(k => Math.hypot(k.x - px, k.z - pz) < k.r)) continue;
      q.setFromAxisAngle(up, Math.atan2(-cx, -cz));
      m4.compose(new THREE.Vector3(px, 0.16, pz), q, new THREE.Vector3(10, 10, 10));
      batch.add(signal, 'roads', m4);
      obstacles.push({ minX: px - 0.35, maxX: px + 0.35, minZ: pz - 0.35, maxZ: pz + 0.35, height: 5.5 });
    }
  }

  for (const mesh of batch.build(scene)) disposables.push(mesh);

  for (const t of treeSpots) obstacles.push({ minX: t.x - 0.35, maxX: t.x + 0.35, minZ: t.z - 0.35, maxZ: t.z + 0.35, height: 6 });
  for (const o of buildTrees(scene, treeSpots)) disposables.push(o);

  // street lamp bulbs: dark by day, glowing at night (driven by the atmosphere's night factor)
  if (bulbs.length) {
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xFFF4D6, emissive: 0xFFD99A, emissiveIntensity: 0, roughness: 0.3 });
    nightGlow.push({ material: bulbMat, max: 2.2 });
    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), bulbMat, bulbs.length);
    const mm = new THREE.Matrix4();
    bulbs.forEach((b, i) => { mm.makeTranslation(b.x, b.y, b.z); bulbMesh.setMatrixAt(i, mm); });
    scene.add(bulbMesh);
    disposables.push(bulbMesh);
  }

  // --- districts: tinted lot + monument sign -------------------------------------------------------
  const zones = districtZones(buildings, intersections);
  for (const z of zones) {
    const tint = new THREE.Mesh(
      flatQuad(z.cx, z.cz, z.half * 2 + 1.2, z.half * 2 + 1.2, 0.02),
      new THREE.MeshStandardMaterial({ color: z.color, transparent: true, opacity: 0.16, roughness: 0.9, depthWrite: false }),
    );
    tint.receiveShadow = true;
    scene.add(tint);
    disposables.push(tint);

    // sign on the block corner nearest the city centre, readable from the street
    const sx = z.cx - Math.sign(z.cx || 1) * (z.half - 0.6);
    const sz = z.cz - Math.sign(z.cz || 1) * (z.half - 0.6);
    const sign = districtSign(z);
    sign.position.set(sx, 0, sz);
    sign.rotation.y = Math.atan2(-sx, -sz);   // face the city centre
    scene.add(sign);
    disposables.push(sign);
    obstacles.push({ minX: sx - 1.6, maxX: sx + 1.6, minZ: sz - 1.6, maxZ: sz + 1.6, height: 3.2 });
  }

  return {
    obstacles,
    hiddenBuildingIds: hidden,
    zones,
    lamps: bulbs,
    dispose: () => {
      for (const o of disposables) {
        scene.remove(o);
        o.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach(mt => { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); });
          }
        });
      }
    },
  };
}

/** Low-poly but natural trees: one instanced trunk mesh + one instanced crown mesh (4 draw calls with shadows). */
function buildTrees(scene: THREE.Scene, spots: { x: number; z: number; s: number }[]): THREE.Object3D[] {
  if (!spots.length) return [];
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 7);
  trunkGeo.translate(0, 1.2, 0);
  const blobs: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r, detail] of [[0, 3.4, 0, 1.55, 1], [0.75, 2.9, 0.3, 1.1, 0], [-0.65, 3.0, -0.35, 1.15, 0], [0.1, 4.2, -0.2, 1.05, 0]]) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.translate(x, y, z);
    blobs.push(g.toNonIndexed());
  }
  const crownGeo = mergeGeometries(blobs)!;
  crownGeo.computeVertexNormals();
  blobs.forEach(b => b.dispose());
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5B4030, roughness: 0.95 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.85, flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const greens = [0x2E5520, 0x3A6526, 0x264619, 0x44702A, 0x325C22];
  spots.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i * 13) * Math.PI * 2);
    m.compose(new THREE.Vector3(t.x, 0.1, t.z), q, new THREE.Vector3(t.s * 1.3, t.s * 1.3, t.s * 1.3));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, new THREE.Color(greens[i % greens.length]));
  });
  for (const im of [trunks, crowns]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  return [trunks, crowns];
}

function districtSign(z: DistrictZone): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x3B4048, roughness: 0.6, metalness: 0.2 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 1.1), stone);
  base.position.y = 0.25;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.3, 0.5), stone);
  slab.position.y = 1.6;
  base.castShadow = slab.castShadow = true;
  g.add(base, slab);

  const c = document.createElement('canvas');
  c.width = 1024; c.height = 420;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#14171C';
  ctx.fillRect(0, 0, 1024, 420);
  ctx.fillStyle = z.color;
  ctx.fillRect(0, 0, 1024, 26);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 110px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(z.name.replace(' District', '').toUpperCase(), 512, 175);
  ctx.fillStyle = z.color;
  ctx.font = '600 50px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('DISTRICT', 512, 280);
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '36px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(z.tagline, 512, 360);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.35 });
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 2.0), face);
    p.position.set(0, 1.6, side * 0.26);
    if (side < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------
// Cars

const CAR_SCALE = 1.7;
const LIGHT_GEO = new THREE.PlaneGeometry(0.22, 0.1);
const headMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFF3D0, emissiveIntensity: 0, side: THREE.DoubleSide });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xFF2A1A, emissiveIntensity: 0, side: THREE.DoubleSide });
const CAR_MODELS: Record<string, string[]> = {
  CAR: ['sedan', 'sedan-sports', 'taxi', 'suv', 'suv-luxury', 'van', 'hatchback-sports', 'sedan', 'taxi', 'police'],
  BUS: ['delivery', 'truck', 'garbage-truck', 'truck-flat'],
  FIRE_TRUCK: ['firetruck'],
  AMBULANCE: ['ambulance'],
};

/** Loads all car models; returns a factory producing a car group. Each model is merged into one mesh
 *  (body + wheels) shared by every car of that type, so a car costs a single draw call. */
export async function loadCarFactory(): Promise<(v: Vehicle, index: number) => THREE.Group> {
  const names = [...new Set(Object.values(CAR_MODELS).flat())];
  const merged = new Map<string, THREE.Mesh>();
  // (re)register after every atmosphere rebuild: its dispose clears the night-glow list
  if (!nightGlow.some(g => g.material === headMat)) nightGlow.push({ material: headMat, max: 6 }, { material: tailMat, max: 4 });
  await Promise.all(names.map(async n => {
    const model = await loadModel(`cars/${n}.glb`);
    const geos = model.parts.map(p => p.geometry.clone());
    const geo = mergeGeometries(geos.every(g => g.index) ? geos : geos.map(g => (g.index ? g.toNonIndexed() : g)));
    geos.forEach(g => g.dispose());
    if (!geo) return;
    const src = model.parts[0].material as THREE.MeshStandardMaterial;
    // clear-coat car paint: glossy reflections like real lacquer
    const paint = new THREE.MeshPhysicalMaterial({
      map: src.map, roughness: 0.42, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
    });
    const mesh = new THREE.Mesh(geo, paint);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    geo.computeBoundingBox();
    mesh.userData.box = geo.boundingBox!.clone();
    merged.set(n, mesh);
  }));
  return (v, index) => {
    const list = CAR_MODELS[v.type] || CAR_MODELS.CAR;
    const template = merged.get(list[index % list.length]) || merged.values().next().value!;
    const car = new THREE.Group();
    const body = template.clone();          // shares geometry and material
    body.scale.setScalar(CAR_SCALE);
    body.rotation.y = Math.PI / 2;          // model faces +Z, the vehicle group drives along +X
    // head/tail lights (emissive, switched on at night by the atmosphere)
    const box = template.userData.box as THREE.Box3;
    for (const sx of [-0.45, 0.45]) {
      const head = new THREE.Mesh(LIGHT_GEO, headMat);
      head.position.set(sx * (box.max.x - box.min.x) * 0.8, 0.45, box.max.z + 0.01);
      body.add(head);
      const tail = new THREE.Mesh(LIGHT_GEO, tailMat);
      tail.position.set(sx * (box.max.x - box.min.x) * 0.8, 0.5, box.min.z - 0.01);
      tail.rotation.y = Math.PI;
      body.add(tail);
    }
    car.add(body);
    return car;
  };
}
