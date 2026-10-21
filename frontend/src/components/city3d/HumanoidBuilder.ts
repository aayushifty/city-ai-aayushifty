import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Night visibility for every figure: a cool moonlit rim around the silhouette plus a faint lift, so dark clothes
 * still read against dark streets. 0 by day .. 1 at night (set from the atmosphere's night factor).
 */
export const humanoidNightRim = { value: 0 };

function addNightRim(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNightRim = humanoidNightRim;
    shader.fragmentShader = 'uniform float uNightRim;\n' +shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimNdv = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      totalEmissiveRadiance += vec3(0.62, 0.74, 1.0) * (0.07 + 0.95 * pow(rimNdv, 2.2)) * uNightRim;`);
  };
  mat.customProgramCacheKey = () => 'humanoid-night-rim';
}

/**
 * Procedural, rigged human figures for the citizens and the Governor.
 *
 * Built from smooth tapered limbs with real joints (hips, knees, ankles, shoulders, elbows, neck), a sculpted
 * torso (lathe profile), a face (eyes, brows, nose, lips, ears), several hair styles and role clothing.
 * `animateHumanoid` drives blended walk / run / idle / talk / work cycles, so nothing snaps between states.
 * The figure stands on y = 0, faces +Z and is about 1.75 units tall.
 */

export type ClothingStyle =
  | 'CONSTRUCTION' | 'DOCTOR' | 'ARCHITECT' | 'ENGINEER' | 'QA' | 'SECURITY' | 'DEVOPS'
  | 'EXECUTIVE' | 'SCIENTIST' | 'DIAGNOSTIC' | 'GOVERNOR';

export interface HumanoidOptions {
  seed: string;               // stable variation (body shape, hair style) per character
  style: ClothingStyle;
  accentColor: string;        // role colour (shirt / trims)
  skinColor?: string;
  hairColor?: string;
}

export interface HumanoidRig {
  body: THREE.Object3D;
  pelvis: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  eyes: THREE.Object3D[];
  hipL: THREE.Object3D; kneeL: THREE.Object3D; ankleL: THREE.Object3D;
  hipR: THREE.Object3D; kneeR: THREE.Object3D; ankleR: THREE.Object3D;
  shoulderL: THREE.Object3D; elbowL: THREE.Object3D;
  shoulderR: THREE.Object3D; elbowR: THREE.Object3D;
  // blend weights (smoothed every frame)
  walk: number; talk: number; work: number;
  phase: number;
  blinkAt: number;
  restArmZ: number;
}

export interface HumanoidState {
  moving: boolean;
  speed?: number;      // 1 = walk, ~1.8 = run
  talking?: boolean;
  working?: boolean;
}

// ---------- shared geometry cache (15 citizens share the same buffers) ----------
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const TORSO_PROFILE = [
  [0.0, 0.0], [0.140, 0.0], [0.146, 0.05], [0.150, 0.13], [0.162, 0.22], [0.178, 0.31],
  [0.184, 0.37], [0.176, 0.42], [0.140, 0.465], [0.075, 0.49], [0.0, 0.495],
].map(([r, y]) => new THREE.Vector2(r, y));

const COAT_PROFILE = [
  [0.150, 0.0], [0.156, 0.05], [0.166, 0.14], [0.180, 0.24], [0.192, 0.32], [0.186, 0.40], [0.150, 0.46], [0.08, 0.49],
].map(([r, y]) => new THREE.Vector2(r, y));

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mat(color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  return o;
}

function limb(key: string, rTop: number, rBottom: number, length: number): THREE.BufferGeometry {
  return geo(`limb:${key}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, 14, 1);
    g.translate(0, -length / 2, 0);
    return g;
  });
}

const sphere = (r: number, w = 16, h = 12) => geo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));

interface Outfit {
  top: string;        // torso + sleeves
  bottom: string;     // pants
  shoes: string;
  longCoat?: string;  // knee-length coat (lab coat, trench)
  shortSleeves?: boolean;
  tie?: string;
  vest?: string;      // hi-vis / tactical vest over the top
  stripes?: boolean;
  hat?: 'hardhat' | 'scrubcap' | 'cap' | 'circlet';
  hatColor?: string;
  glasses?: boolean;
  headset?: boolean;
  hood?: boolean;
  prop?: 'tablet' | 'clipboard' | 'tube' | 'stethoscope';
}

function outfitFor(style: ClothingStyle, accent: string, v: number): Outfit {
  switch (style) {
    case 'CONSTRUCTION':
      return { top: '#3F6EA8', bottom: '#2B4C7E', shoes: '#7C4A1E', vest: '#F97316', stripes: true, hat: 'hardhat', hatColor: '#FACC15' };
    case 'DOCTOR':
      return { top: '#7DD3FC', bottom: '#1E3A5F', shoes: '#E2E8F0', longCoat: '#F8FAFC', hat: v % 2 ? 'scrubcap' : undefined, hatColor: '#0284C7', prop: 'stethoscope' };
    case 'SCIENTIST':
      return { top: accent, bottom: '#334155', shoes: '#1E293B', longCoat: '#F1F5F9', glasses: true, prop: 'tablet' };
    case 'ARCHITECT':
      return { top: '#1E3A8A', bottom: '#475569', shoes: '#3F2A1D', tie: accent, glasses: v % 3 === 0, prop: 'tube' };
    case 'ENGINEER':
      return { top: v % 2 ? '#27272A' : '#3F3F46', bottom: '#1F2937', shoes: '#F59E0B', hood: true, headset: true, prop: 'tablet' };
    case 'QA':
      return { top: accent, bottom: '#334155', shoes: '#F8FAFC', shortSleeves: true, glasses: v % 2 === 0, prop: 'clipboard' };
    case 'SECURITY':
      return { top: '#111827', bottom: '#0B0F19', shoes: '#000000', vest: '#1F2937', hat: 'cap', hatColor: '#111827' };
    case 'DEVOPS':
      return { top: '#0E7490', bottom: '#334155', shoes: '#0F172A', hood: v % 2 === 0, headset: v % 2 === 1 };
    case 'DIAGNOSTIC':
      return { top: accent, bottom: '#1E293B', shoes: '#0F172A', shortSleeves: v % 2 === 0, glasses: true, prop: 'tablet' };
    case 'GOVERNOR':
      return { top: '#0B1224', bottom: '#111827', shoes: '#050505', longCoat: '#0B1224', tie: '#F59E0B', hat: 'circlet', hatColor: '#F59E0B' };
    case 'EXECUTIVE':
    default:
      return { top: '#111827', bottom: '#1E293B', shoes: '#0A0A0A', tie: accent, longCoat: v % 3 === 0 ? '#1F2937' : undefined };
  }
}

const SKIN_TONES = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#D8A06A', '#B9835A'];
const HAIR_COLORS = ['#1C1C1C', '#2D251E', '#3B2A20', '#4A3426', '#141414', '#6B4E37'];

export function createHumanoid(opts: HumanoidOptions): THREE.Group {
  const h = hash(opts.seed);
  const v = h % 97;
  const feminine = (h >>> 3) % 3 === 0;
  const heightScale = 0.95 + ((h >>> 5) % 11) / 100;      // 0.95 .. 1.05
  const shoulderW = feminine ? 0.9 : 1.0 + ((h >>> 7) % 6) / 100;
  const hipW = feminine ? 1.08 : 1.0;
  const build = 0.96 + ((h >>> 9) % 9) / 100;            // girth

  const skin = mat(opts.skinColor || SKIN_TONES[h % SKIN_TONES.length], 0.55);
  const hairM = mat(opts.hairColor || HAIR_COLORS[(h >>> 11) % HAIR_COLORS.length], 0.75);
  const fit = outfitFor(opts.style, opts.accentColor, v);
  const topM = mat(fit.top, 0.85);
  const bottomM = mat(fit.bottom, 0.9);
  const shoeM = mat(fit.shoes, 0.45, 0.1);
  const coatM = fit.longCoat ? mat(fit.longCoat, 0.8) : null;
  const sleeveM = coatM || topM;
  const lipM = mat(new THREE.Color(skin.color).multiplyScalar(0.72), 0.6);
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.3 });
  const irisM = new THREE.MeshStandardMaterial({ color: ['#3B2A1A', '#1F3A5F', '#2F4F2F', '#4B3621'][h % 4], roughness: 0.2 });

  const root = new THREE.Group();
  const body = new THREE.Bone();
  root.add(body);

  // ---------------- pelvis & legs ----------------
  const pelvis = new THREE.Bone();
  pelvis.position.y = 0.92;
  body.add(pelvis);
  const hips = mesh(sphere(0.16, 20, 14), bottomM, 0, 0.03, 0);
  hips.scale.set(hipW * build, 0.62, 0.72 * build);
  pelvis.add(hips);

  const makeLeg = (side: 1 | -1) => {
    const hip = new THREE.Bone();
    hip.position.set(0.095 * side * hipW, 0, 0);
    pelvis.add(hip);
    hip.add(mesh(limb(`thigh${build}`, 0.078 * build, 0.060 * build, 0.42), bottomM));
    const knee = new THREE.Bone();
    knee.position.y = -0.42;
    hip.add(knee);
    knee.add(mesh(sphere(0.06), bottomM));
    knee.add(mesh(limb(`shin${build}`, 0.058 * build, 0.044, 0.42), bottomM));
    const ankle = new THREE.Bone();
    ankle.position.y = -0.42;
    knee.add(ankle);
    const shoe = mesh(sphere(0.062, 16, 10), shoeM, 0, -0.035, 0.045);
    shoe.scale.set(0.95, 0.62, 2.05);
    ankle.add(shoe);
    const sole = mesh(geo('sole', () => new THREE.BoxGeometry(0.11, 0.018, 0.25)), mat('#1A1A1A', 0.9), 0, -0.068, 0.045, false);
    ankle.add(sole);
    return { hip, knee, ankle };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ---------------- spine, torso ----------------
  const spine = new THREE.Bone();
  spine.position.y = 0.98 - 0.92;
  pelvis.add(spine);
  const torsoG = geo('torso', () => new THREE.LatheGeometry(TORSO_PROFILE, 28));
  const chest = mesh(torsoG, topM, 0, -0.03, 0);
  chest.scale.set(shoulderW * build, 1, 0.62 * build);
  const chestBone = new THREE.Bone();   // breathing scales this bone
  spine.add(chestBone);
  chestBone.add(chest);
  const belt = mesh(geo('belt', () => new THREE.TorusGeometry(0.145, 0.014, 6, 24)), mat('#1C1917', 0.5, 0.2), 0, -0.02, 0, false);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(hipW * build, 0.65 * build, 1);
  spine.add(belt);

  if (fit.longCoat && coatM) {
    const coatUpper = mesh(geo('coatUpper', () => new THREE.LatheGeometry(COAT_PROFILE, 28)), coatM, 0, -0.02, 0);
    coatUpper.scale.set(shoulderW * build * 1.04, 1, 0.66 * build);
    spine.add(coatUpper);
    const skirt = mesh(geo('coatSkirt', () => {
      const g = new THREE.CylinderGeometry(0.158, 0.205, 0.46, 24, 1, true);
      g.translate(0, -0.23, 0);
      return g;
    }), coatM, 0, 0.0, 0);
    (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    skirt.scale.set(hipW * build * 1.05, 1, 0.74 * build);
    spine.add(skirt);
    // open front: a strip of the shirt visible down the middle
    const placket = mesh(geo('placket', () => new THREE.BoxGeometry(0.07, 0.4, 0.01)), topM, 0, 0.2, 0.118 * build);
    spine.add(placket);
  }
  if (fit.vest) {
    const vest = mesh(geo('vest', () => new THREE.LatheGeometry(COAT_PROFILE.slice(0, 6), 28)), mat(fit.vest, 0.7), 0, 0.0, 0);
    vest.scale.set(shoulderW * build * 1.05, 0.95, 0.66 * build);
    spine.add(vest);
    if (fit.stripes) {
      const stripeM = new THREE.MeshStandardMaterial({ color: 0xE5E7EB, emissive: 0x9CA3AF, emissiveIntensity: 0.6, roughness: 0.3 });
      for (const y of [0.13, 0.24]) {
        const s = mesh(geo('stripe', () => new THREE.CylinderGeometry(1, 1, 0.028, 28, 1, true)), stripeM, 0, y, 0, false);
        s.scale.set(0.168 * shoulderW * build * 1.07, 1, 0.168 * 0.67 * build);
        spine.add(s);
      }
    }
  }
  if (fit.tie) {
    const tie = mesh(geo('tie', () => new THREE.ConeGeometry(0.028, 0.26, 4)), mat(fit.tie, 0.5), 0, 0.31, 0.112 * build);
    tie.rotation.x = Math.PI;
    tie.scale.z = 0.35;
    spine.add(tie);
    const collar = mesh(geo('collar', () => new THREE.TorusGeometry(0.062, 0.016, 6, 16)), mat('#F8FAFC', 0.6), 0, 0.47, 0.012, false);
    collar.rotation.x = Math.PI / 2;
    spine.add(collar);
  }
  if (fit.hood) {
    const hood = mesh(geo('hood', () => new THREE.TorusGeometry(0.085, 0.035, 8, 18, Math.PI * 1.25)), topM, 0, 0.48, -0.03);
    hood.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.875);
    spine.add(hood);
  }

  // ---------------- arms ----------------
  const makeArm = (side: 1 | -1) => {
    const shoulder = new THREE.Bone();
    shoulder.position.set(0.205 * side * shoulderW * build, 0.425, 0);
    spine.add(shoulder);
    const deltoid = mesh(sphere(0.058), sleeveM, 0, -0.01, 0);
    deltoid.scale.set(0.95, 0.9, 0.9);
    shoulder.add(deltoid);
    shoulder.add(mesh(limb(`upper${build}`, 0.054 * build, 0.044 * build, 0.30), fit.shortSleeves ? topM : sleeveM));
    if (fit.shortSleeves) {
      // short sleeve ends above the elbow; the rest of the upper arm is skin
      shoulder.children[shoulder.children.length - 1].scale.y = 0.5;
      const bare = mesh(limb('upperBare', 0.046, 0.043, 0.16), skin, 0, -0.14, 0);
      shoulder.add(bare);
    }
    const elbow = new THREE.Bone();
    elbow.position.y = -0.30;
    shoulder.add(elbow);
    elbow.add(mesh(sphere(0.044), fit.shortSleeves ? skin : sleeveM));
    elbow.add(mesh(limb('fore', 0.043, 0.033, 0.26), fit.shortSleeves ? skin : sleeveM));
    const cuff = mesh(limb('cuff', 0.036, 0.036, 0.03), fit.shortSleeves ? skin : sleeveM, 0, -0.23, 0);
    elbow.add(cuff);
    const hand = mesh(sphere(0.043, 14, 10), skin, 0, -0.30, 0.005);
    hand.scale.set(0.72, 1.22, 0.48);
    elbow.add(hand);
    const thumb = mesh(sphere(0.016, 8, 6), skin, -0.022 * side, -0.285, 0.022);
    thumb.scale.set(1, 1.6, 1);
    elbow.add(thumb);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const restArmZ = 0.07;
  armL.shoulder.rotation.z = -restArmZ;
  armR.shoulder.rotation.z = restArmZ;

  // ---------------- neck & head ----------------
  const neck = new THREE.Bone();
  neck.position.y = 0.47;
  spine.add(neck);
  neck.add(mesh(limb('neck2', 0.052, 0.06, 0.08), skin, 0, 0.075, 0.0));
  const head = new THREE.Bone();
  head.position.y = 0.035;
  neck.add(head);
  const skull = mesh(sphere(0.105, 24, 18), skin, 0, 0.13, 0);
  skull.scale.set(feminine ? 0.88 : 0.92, 1.12, 1.0);
  head.add(skull);
  const jaw = mesh(sphere(0.08, 18, 12), skin, 0, 0.078, 0.008);
  jaw.scale.set(feminine ? 0.88 : 0.95, 0.8, 0.92);
  const jawBone = new THREE.Bone();      // talking opens the jaw by scaling this bone
  jawBone.position.copy(jaw.position);
  jaw.position.set(0, 0, 0);
  head.add(jawBone);
  jawBone.add(jaw);
  // ears
  for (const side of [-1, 1]) {
    const ear = mesh(sphere(0.026, 10, 8), skin, 0.097 * side, 0.125, -0.005);
    ear.scale.set(0.45, 1.0, 0.75);
    head.add(ear);
  }
  // eyes
  const eyes: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Bone();
    eye.position.set(0.037 * side, 0.142, 0.083);
    const white = mesh(sphere(0.0165, 12, 10), eyeWhite, 0, 0, 0, false);
    white.scale.z = 0.6;
    eye.add(white);
    eye.add(mesh(sphere(0.0095, 10, 8), irisM, 0, 0, 0.0085, false));
    eye.add(mesh(sphere(0.0048, 8, 6), mat('#050505', 0.1), 0, 0, 0.0128, false));
    head.add(eye);
    eyes.push(eye);
    const brow = mesh(geo('brow', () => new THREE.BoxGeometry(0.036, 0.0075, 0.008)), hairM, 0.038 * side, 0.168, 0.093, false);
    brow.rotation.z = -0.12 * side;
    head.add(brow);
  }
  const nose = mesh(sphere(0.017, 10, 8), skin, 0, 0.115, 0.103, false);
  nose.scale.set(0.75, 1.25, 1.1);
  head.add(nose);
  const lips = mesh(geo('lips', () => new THREE.CapsuleGeometry(0.008, 0.03, 4, 8)), lipM, 0, 0.078, 0.094, false);
  lips.rotation.z = Math.PI / 2;
  head.add(lips);

  // hair
  const hairStyle = opts.style === 'GOVERNOR' ? 1 : (h >>> 13) % (feminine ? 3 : 4);
  const hasHat = !!fit.hat && fit.hat !== 'circlet';
  if (!hasHat || fit.hat === 'cap') {
    const cap = mesh(geo('hairCap', () => new THREE.SphereGeometry(0.113, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)), hairM, 0, 0.142, -0.008);
    cap.scale.set(0.97, 1.08, 1.06);
    cap.rotation.x = -0.32;
    head.add(cap);
    if (feminine && hairStyle !== 2) {
      // long hair falling behind the shoulders
      const back = mesh(geo('hairBack', () => new THREE.CapsuleGeometry(0.07, 0.13, 6, 12)), hairM, 0, 0.075, -0.068);
      back.scale.set(1.15, 1.0, 0.42);
      head.add(back);
    } else if (feminine) {
      head.add(mesh(sphere(0.045), hairM, 0, 0.2, -0.085)); // bun
    } else if (hairStyle === 3) {
      const quiff = mesh(sphere(0.06, 14, 10), hairM, 0, 0.225, 0.04);
      quiff.scale.set(1.3, 0.55, 1.0);
      head.add(quiff);
    }
  }
  if (fit.hat === 'hardhat') {
    const hatM = mat(fit.hatColor || '#FACC15', 0.35, 0.05);
    head.add(mesh(geo('hardhat', () => new THREE.SphereGeometry(0.125, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)), hatM, 0, 0.17, 0));
    const brim = mesh(geo('hardbrim', () => new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24)), hatM, 0, 0.172, 0.018);
    brim.scale.z = 1.12;
    head.add(brim);
  } else if (fit.hat === 'scrubcap') {
    head.add(mesh(geo('scrub', () => new THREE.SphereGeometry(0.116, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), mat(fit.hatColor || '#0284C7', 0.8), 0, 0.145, -0.005));
  } else if (fit.hat === 'cap') {
    const capM = mat(fit.hatColor || '#111827', 0.7);
    head.add(mesh(geo('capTop', () => new THREE.SphereGeometry(0.117, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), capM, 0, 0.17, -0.004));
    const bill = mesh(geo('capBill', () => new THREE.CylinderGeometry(0.075, 0.075, 0.01, 18, 1, false, -Math.PI / 2, Math.PI)), capM, 0, 0.172, 0.1);
    head.add(bill);
  } else if (fit.hat === 'circlet') {
    const c = mesh(geo('circlet', () => new THREE.TorusGeometry(0.104, 0.008, 8, 28)), mat(fit.hatColor || '#F59E0B', 0.25, 0.9), 0, 0.2, -0.01, false);
    c.rotation.x = Math.PI / 2 - 0.25;
    head.add(c);
  }
  if (fit.glasses) {
    const frameM = mat('#111827', 0.3, 0.6);
    for (const side of [-1, 1]) {
      head.add(mesh(geo('lens', () => new THREE.TorusGeometry(0.022, 0.0035, 6, 18)), frameM, 0.038 * side, 0.142, 0.101, false));
    }
    head.add(mesh(geo('bridge', () => new THREE.BoxGeometry(0.03, 0.004, 0.004)), frameM, 0, 0.147, 0.103, false));
  }
  if (fit.headset) {
    const hsM = mat('#1E293B', 0.4, 0.6);
    const band = mesh(geo('hsBand', () => new THREE.TorusGeometry(0.118, 0.008, 6, 20, Math.PI)), hsM, 0, 0.13, -0.005, false);
    head.add(band);
    for (const side of [-1, 1]) {
      const cup = mesh(geo('hsCup', () => new THREE.CylinderGeometry(0.032, 0.032, 0.022, 14)), hsM, 0.105 * side, 0.125, 0, false);
      cup.rotation.z = Math.PI / 2;
      head.add(cup);
    }
    const mic = mesh(geo('hsMic', () => new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6)), hsM, -0.085, 0.085, 0.06, false);
    mic.rotation.set(0.9, 0, 0.5);
    head.add(mic);
  }

  // ---------------- props ----------------
  if (fit.prop === 'tablet') {
    const t = mesh(geo('tablet', () => new THREE.BoxGeometry(0.15, 0.2, 0.012)), mat('#0F172A', 0.25, 0.6), 0, -0.33, 0.06);
    const screen = mesh(geo('tabletScreen', () => new THREE.PlaneGeometry(0.13, 0.18)),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.accentColor).lerp(new THREE.Color('#E0F2FE'), 0.4) }), 0, 0, 0.0065, false);
    t.add(screen);
    t.rotation.x = -0.9;
    armL.elbow.add(t);
  } else if (fit.prop === 'clipboard') {
    const cb = mesh(geo('clip', () => new THREE.BoxGeometry(0.16, 0.22, 0.012)), mat('#78350F', 0.7), 0, -0.33, 0.05);
    cb.add(mesh(geo('paper', () => new THREE.PlaneGeometry(0.14, 0.18)), mat('#F8FAFC', 0.9), 0, -0.01, 0.0065, false));
    cb.rotation.x = -0.8;
    armR.elbow.add(cb);
  } else if (fit.prop === 'tube') {
    const tube = mesh(geo('tube', () => new THREE.CylinderGeometry(0.035, 0.035, 0.62, 12)), mat('#1E3A8A', 0.5), 0.0, 0.25, -0.13);
    tube.rotation.z = 0.7;
    spine.add(tube);
  } else if (fit.prop === 'stethoscope') {
    const st = mesh(geo('steth', () => new THREE.TorusGeometry(0.085, 0.009, 6, 20, Math.PI * 1.15)), mat('#334155', 0.3, 0.6), 0, 0.4, 0.06, false);
    st.rotation.set(Math.PI / 2 + 0.6, 0, Math.PI * 0.93);
    spine.add(st);
  }

  // One skinned mesh per figure: every part is bound rigidly to its joint (bone) and coloured by vertex.
  // 1 draw call (+1 for shadows) instead of ~90 per person.
  skinFigure(root);

  root.scale.setScalar(heightScale);

  const rig: HumanoidRig = {
    body, pelvis, spine, chest: chestBone, neck, head, jaw: jawBone, eyes,
    hipL: legL.hip, kneeL: legL.knee, ankleL: legL.ankle,
    hipR: legR.hip, kneeR: legR.knee, ankleR: legR.ankle,
    shoulderL: armL.shoulder, elbowL: armL.elbow,
    shoulderR: armR.shoulder, elbowR: armR.elbow,
    walk: 0, talk: 0, work: 0,
    phase: (h % 628) / 100,
    blinkAt: 0,
    restArmZ,
  };
  root.userData.rig = rig;
  return root;
}

function skinFigure(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const boneIndex = new Map<THREE.Object3D, number>(bones.map((b, i) => [b, i]));
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    let b: THREE.Object3D | null = m.parent;
    while (b && !(b as THREE.Bone).isBone) b = b.parent;
    const bi = b ? boneIndex.get(b) ?? 0 : 0;
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    let g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(toRoot);
    if (g.index) g = g.toNonIndexed();
    if (toRoot.determinant() < 0) {
      for (const name of ['position', 'normal']) {
        const arr = (g.attributes[name] as THREE.BufferAttribute).array as Float32Array;
        for (let t = 0; t < arr.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = arr[t + 3 + k]; arr[t + 3 + k] = arr[t + 6 + k]; arr[t + 6 + k] = tmp; }
      }
    }
    const n = g.attributes.position.count;
    const color = ((m.material as THREE.MeshStandardMaterial).color || new THREE.Color(1, 1, 1));
    const colors = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      skinIndex[i * 4] = bi;
      skinWeight[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    g.clearGroups();
    geos.push(g);
  }
  for (const m of meshes) m.removeFromParent();
  const merged = mergeGeometries(geos);
  geos.forEach(g => g.dispose());
  if (!merged) return;
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.03 });
  addNightRim(bodyMat);
  const skinned = new THREE.SkinnedMesh(merged, bodyMat);
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;   // limbs move outside the bind-pose bounds
  root.add(skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(bones));
}

export function getRig(obj: THREE.Object3D): HumanoidRig | undefined {
  return obj.userData?.rig as HumanoidRig | undefined;
}

/** Advances the figure's animation. `t` is seconds, `dt` the frame time in seconds. */
export function animateHumanoid(obj: THREE.Object3D, t: number, dt: number, state: HumanoidState): void {
  const r = getRig(obj);
  if (!r) return;
  const k = 1 - Math.exp(-dt * 8); // smoothing toward targets
  const speed = state.speed ?? 1;
  r.walk += ((state.moving ? 1 : 0) - r.walk) * k;
  r.talk += ((state.talking && !state.moving ? 1 : 0) - r.talk) * k;
  r.work += ((state.working && !state.moving && !state.talking ? 1 : 0) - r.work) * k;
  r.phase += dt * (5.2 + 3.2 * (speed - 1)) * (0.25 + 0.75 * r.walk);

  const w = r.walk, ph = r.phase;
  const stride = 0.48 + 0.2 * (speed - 1);
  const s = Math.sin(ph), c = Math.cos(ph);

  // legs: hip swing, knee bends while the leg swings forward, foot rolls
  r.hipL.rotation.x = -s * stride * w;
  r.hipR.rotation.x = s * stride * w;
  r.kneeL.rotation.x = w * (0.06 + 0.95 * Math.max(0, c)) * (0.8 + 0.2 * speed);
  r.kneeR.rotation.x = w * (0.06 + 0.95 * Math.max(0, -c)) * (0.8 + 0.2 * speed);
  r.ankleL.rotation.x = w * (-0.25 * Math.max(0, c) + 0.15 * s);
  r.ankleR.rotation.x = w * (-0.25 * Math.max(0, -c) - 0.15 * s);

  // body bob, hip sway and counter-rotation of the chest
  r.body.position.y = w * (Math.abs(c) * 0.035 - 0.03) + (1 - w) * Math.sin(t * 1.6) * 0.004;
  r.pelvis.rotation.y = s * 0.09 * w;
  r.pelvis.rotation.z = c * 0.025 * w;
  r.spine.rotation.y = -s * 0.14 * w;
  r.spine.rotation.x = 0.06 * w * (speed - 1) + 0.02 * w;

  // breathing
  const breath = Math.sin(t * 1.7) * 0.012;
  r.chest.scale.y = 1 + breath * (1 - w);

  // arms: walk swing, idle hang, talk gestures, work (typing / handling tools)
  const swing = 0.42 + 0.25 * (speed - 1);
  const talkWave = Math.sin(t * 3.1);
  const workJit = Math.sin(t * 11) * 0.04;
  const idleSway = Math.sin(t * 1.3) * 0.03;

  r.shoulderL.rotation.x = s * swing * w + (-0.55 + workJit) * r.work + (-0.15 + idleSway) * r.talk + idleSway * (1 - w);
  r.shoulderR.rotation.x = -s * swing * w + (-0.55 - workJit) * r.work + (-0.65 + talkWave * 0.18) * r.talk - idleSway * (1 - w);
  r.elbowL.rotation.x = -(0.18 + 0.3 * w * Math.max(0, s)) - 1.0 * r.work - 0.25 * r.talk;
  r.elbowR.rotation.x = -(0.18 + 0.3 * w * Math.max(0, -s)) - 1.0 * r.work - (0.9 + talkWave * 0.25) * r.talk;
  r.shoulderL.rotation.z = -r.restArmZ - 0.05 * w;
  r.shoulderR.rotation.z = r.restArmZ + 0.05 * w + 0.12 * r.talk * (0.5 + 0.5 * talkWave);

  // head: steady while walking, nods while talking, looks down while working
  r.neck.rotation.x = -0.04 * w + Math.sin(t * 5.3) * 0.045 * r.talk + 0.32 * r.work;
  r.neck.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - w) * (1 - r.work);
  r.jaw.scale.y = 1 + r.talk * (0.075 + 0.075 * Math.max(0, Math.sin(t * 13)));

  // blinking
  if (t > r.blinkAt + 0.12) {
    for (const e of r.eyes) e.scale.y = 1;
    if (t > r.blinkAt + 3.5 && Math.random() < dt * 0.6) r.blinkAt = t;
  } else {
    for (const e of r.eyes) e.scale.y = 0.12;
  }
}
