import * as THREE from 'three';
import { animateHumanoid, ClothingStyle, createHumanoid } from './HumanoidBuilder';
import { RoadSegment } from '../../simulation/types';

/**
 * Background pedestrians (scenery, not AI citizens): people walking the sidewalks along every avenue
 * and street, crossing at the zebra crossings and turning back at the edge of the city.
 * Each is one skinned mesh (1 draw call), and only those near the camera are animated.
 */

interface Walker {
  obj: THREE.Group;
  axis: 'x' | 'z';      // walks along x (east-west sidewalk) or z (north-south)
  fixed: number;        // the other coordinate (road centre line + sidewalk offset)
  min: number; max: number;
  p: number;            // position along the line
  dir: 1 | -1;
  speed: number;
}

const STYLES: ClothingStyle[] = ['EXECUTIVE', 'QA', 'DEVOPS', 'ENGINEER', 'SCIENTIST', 'DIAGNOSTIC', 'ARCHITECT', 'EXECUTIVE', 'QA'];
const ACCENTS = ['#E11D48', '#2563EB', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#475569'];
const SIDEWALK = 3.1;
const SCALE = 1.4;      // same scale as the citizens

function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface CityLife {
  update: (dt: number, time: number, camera: THREE.Vector3) => void;
  obstacles: () => { x: number; z: number; r: number }[];
  dispose: () => void;
}

export function spawnPedestrians(scene: THREE.Scene, roads: RoadSegment[], count: number): CityLife {
  // straight sidewalk lines: one per avenue (constant z) and per street (constant x), both sides
  const lines: { axis: 'x' | 'z'; fixed: number; min: number; max: number }[] = [];
  const rows = new Map<string, { axis: 'x' | 'z'; c: number; min: number; max: number }>();
  for (const r of roads) {
    const ew = Math.abs(r.end[1] - r.start[1]) < 0.01;
    const axis = ew ? 'x' : 'z';
    const c = ew ? r.start[1] : r.start[0];
    const lo = Math.min(ew ? r.start[0] : r.start[1], ew ? r.end[0] : r.end[1]);
    const hi = Math.max(ew ? r.start[0] : r.start[1], ew ? r.end[0] : r.end[1]);
    const key = `${axis}:${c}`;
    const row = rows.get(key);
    if (row) { row.min = Math.min(row.min, lo); row.max = Math.max(row.max, hi); }
    else rows.set(key, { axis, c, min: lo, max: hi });
  }
  rows.forEach(r => { for (const side of [-1, 1]) lines.push({ axis: r.axis, fixed: r.c + side * SIDEWALK, min: r.min + 4, max: r.max - 4 }); });

  const walkers: Walker[] = [];
  if (lines.length) {
    for (let i = 0; i < count; i++) {
      const line = lines[Math.floor(rand(i + 1) * lines.length)];
      const obj = createHumanoid({
        seed: `pedestrian-${i}`,
        style: STYLES[i % STYLES.length],
        accentColor: ACCENTS[Math.floor(rand(i + 7) * ACCENTS.length)],
      });
      obj.scale.multiplyScalar(SCALE);
      obj.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      scene.add(obj);
      walkers.push({
        obj, axis: line.axis, fixed: line.fixed, min: line.min, max: line.max,
        p: line.min + rand(i + 3) * (line.max - line.min),
        dir: rand(i + 5) > 0.5 ? 1 : -1,
        speed: 1.25 + rand(i + 9) * 0.6,
      });
    }
  }

  const place = (w: Walker) => {
    if (w.axis === 'x') w.obj.position.set(w.p, 0.16, w.fixed);
    else w.obj.position.set(w.fixed, 0.16, w.p);
    // the figure faces +Z; heading along +x/-x or +z/-z
    w.obj.rotation.y = w.axis === 'x' ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI);
  };
  walkers.forEach(place);

  return {
    update: (dt, time, camera) => {
      for (const w of walkers) {
        w.p += w.dir * w.speed * dt;
        if (w.p > w.max) { w.p = w.max; w.dir = -1; }
        if (w.p < w.min) { w.p = w.min; w.dir = 1; }
        place(w);
        const dist = w.obj.position.distanceTo(camera);
        w.obj.visible = dist < 260;
        if (dist < 90) animateHumanoid(w.obj, time, dt, { moving: true, speed: 1 });
      }
    },
    obstacles: () => walkers.map(w => ({ x: w.obj.position.x, z: w.obj.position.z, r: 0.5 })),
    dispose: () => walkers.forEach(w => w.obj.removeFromParent()),
  };
}
