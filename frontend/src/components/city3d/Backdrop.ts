import * as THREE from 'three';
import { nightGlow } from './CityDressing';

/**
 * Landscape around the city: flat ground under the streets that rises into rolling hills beyond the
 * city edge, plus a distant skyline of towers on one side that fades into the haze.
 */

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t: number) { return t * t * (3 - 2 * t); }
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let sum = 0, amp = 0.55, f = 1;
  for (let i = 0; i < 5; i++) { sum += amp * valueNoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return sum;
}

export interface Backdrop { ground: THREE.Mesh; dispose: () => void }

export function buildBackdrop(scene: THREE.Scene, groundMaterial: THREE.MeshStandardMaterial): Backdrop {
  const SIZE = 1400, SEG = 160;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(1, 1, 1), dry = new THREE.Color(0.86, 0.8, 0.62), rock = new THREE.Color(0.62, 0.6, 0.56);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const rise = Math.max(0, Math.min(1, (r - 175) / 170));          // flat city, hills beyond
    const h = rise * rise * (18 + 75 * fbm(x * 0.006 + 3.1, z * 0.006 - 1.7)) - 0.05;
    pos.setY(i, h);
    const t = Math.min(1, h / 70);
    c.copy(grass).lerp(dry, Math.min(1, t * 1.6)).lerp(rock, Math.max(0, t - 0.55) * 1.4);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // texture repeats every ~8 units
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (SIZE / 8), uv.getY(i) * (SIZE / 8));
  const mat = groundMaterial.clone();
  mat.vertexColors = true;
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // distant skyline to the north-west, sitting in the haze
  const towers: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) {
    const a = THREE.MathUtils.degToRad(205 + hash2(i, 1) * 85);
    const r = 390 + hash2(i, 2) * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 10 + hash2(i, 3) * 16, d = 10 + hash2(i, 4) * 16;
    const hgt = 18 + Math.pow(hash2(i, 5), 1.8) * 55;
    const groundY = Math.max(0, Math.min(1, (r - 175) / 170)) ** 2 * 30;
    m.compose(new THREE.Vector3(x, groundY + hgt / 2 - 2, z), new THREE.Quaternion(), new THREE.Vector3(w, hgt, d));
    towers.push(m.clone());
  }
  // facade with rows of windows; the windows glow at night
  const fc = document.createElement('canvas');
  fc.width = 64; fc.height = 128;
  const g = fc.getContext('2d')!;
  g.fillStyle = '#9AA3AE'; g.fillRect(0, 0, 64, 128);
  const e = document.createElement('canvas');
  e.width = 64; e.height = 128;
  const ge = e.getContext('2d')!;
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 64; x += 10) {
      g.fillStyle = '#3D4B5C'; g.fillRect(x, y, 7, 6);
      if (hash2(x, y) > 0.45) { ge.fillStyle = '#FFD9A0'; ge.fillRect(x, y, 7, 6); }
    }
  }
  const facade = new THREE.CanvasTexture(fc);
  facade.colorSpace = THREE.SRGBColorSpace;
  facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
  facade.repeat.set(2, 4);
  const glow = new THREE.CanvasTexture(e);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.wrapS = glow.wrapT = THREE.RepeatWrapping;
  glow.repeat.set(2, 4);
  const towerMat = new THREE.MeshStandardMaterial({ map: facade, color: 0x9AA6B8, roughness: 0.6, metalness: 0.2, emissive: 0xFFFFFF, emissiveMap: glow, emissiveIntensity: 0 });
  nightGlow.push({ material: towerMat, max: 0.9 });
  const skyline = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, towers.length);
  towers.forEach((t, i) => skyline.setMatrixAt(i, t));
  scene.add(skyline);

  return {
    ground,
    dispose: () => {
      scene.remove(ground, skyline);
      geo.dispose(); mat.dispose();
      skyline.geometry.dispose(); towerMat.dispose();
    },
  };
}
