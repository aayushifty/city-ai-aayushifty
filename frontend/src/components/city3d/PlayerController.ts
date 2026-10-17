/**
 * On-foot player physics and third-person camera helpers (pure functions, no Three.js objects).
 *
 * World convention used by CityScene: yaw 0 looks toward -Z; forward = (-sin yaw, -cos yaw),
 * right = (cos yaw, -sin yaw). Buildings are axis-aligned boxes standing on y = 0.
 */

export interface Box {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number;
}

export interface Circle { x: number; z: number; r: number }

interface FootprintLike { x: number; z: number; width: number; depth: number; height: number; type?: string }

/** Footprint boxes grown by `pad` (parks are walkable and skipped). */
export function buildBoxes(buildings: FootprintLike[], pad: number): Box[] {
  return buildings
    .filter(b => b.type !== 'PARK_SPACE')
    .map(b => ({
      minX: b.x - b.width / 2 - pad, maxX: b.x + b.width / 2 + pad,
      minZ: b.z - b.depth / 2 - pad, maxZ: b.z + b.depth / 2 + pad,
      height: b.height,
    }));
}

export const WALK_SPEED = 5.8;
export const SPRINT_SPEED = 10.5;
const ACCEL = 34;        // units/s² toward the wanted velocity
const BRAKE = 42;        // units/s² when no key is held
const TURN_RATE = 12;    // how fast the body turns toward the travel direction

export interface MoveState {
  x: number; z: number; y: number;
  vx: number; vz: number;
  bodyYaw: number;          // facing used for the avatar (radians, same convention as yaw)
}

/**
 * Advances on-foot movement: camera-relative input, acceleration/braking, body turning,
 * then collision against buildings (circle vs. padded boxes) and nearby citizens.
 */
export function stepMovement(
  s: MoveState,
  input: { forward: number; right: number; sprint: boolean },
  cameraYaw: number,
  dt: number,
  boxes: Box[],
  people: Circle[],
  radius: number,
  cityBound: number,
): { speed: number } {
  const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
  let wx = fx * input.forward + rx * input.right;
  let wz = fz * input.forward + rz * input.right;
  const len = Math.hypot(wx, wz);
  const maxSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  if (len > 1e-3) { wx = (wx / len) * maxSpeed; wz = (wz / len) * maxSpeed; } else { wx = 0; wz = 0; }

  // accelerate toward the wanted velocity (brake harder when there is no input)
  const rate = (len > 1e-3 ? ACCEL : BRAKE) * dt;
  const dvx = wx - s.vx, dvz = wz - s.vz;
  const dlen = Math.hypot(dvx, dvz);
  if (dt <= 0) return { speed: Math.hypot(s.vx, s.vz) };
  if (dlen <= rate) { s.vx = wx; s.vz = wz; } else { s.vx += (dvx / dlen) * rate; s.vz += (dvz / dlen) * rate; }

  s.x += s.vx * dt;
  s.z += s.vz * dt;

  // collisions: push out of padded building footprints, then out of other people
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (s.y - 1.85 > b.height) continue; // standing above it (e.g. mid-jump over something low)
      const cx = Math.max(b.minX, Math.min(s.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(s.z, b.maxZ));
      const dx = s.x - cx, dz = s.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        s.x += (dx / d) * push; s.z += (dz / d) * push;
        // remove the velocity component pointing into the wall so we slide along it
        const nx = dx / d, nz = dz / d;
        const into = s.vx * nx + s.vz * nz;
        if (into < 0) { s.vx -= into * nx; s.vz -= into * nz; }
      } else {
        // centre is inside the box: leave by the nearest side
        const l = s.x - b.minX, r = b.maxX - s.x, t = s.z - b.minZ, bt = b.maxZ - s.z;
        const m = Math.min(l, r, t, bt);
        if (m === l) s.x = b.minX - radius; else if (m === r) s.x = b.maxX + radius;
        else if (m === t) s.z = b.minZ - radius; else s.z = b.maxZ + radius;
      }
    }
    for (const c of people) {
      const dx = s.x - c.x, dz = s.z - c.z;
      const minD = radius + c.r;
      const d = Math.hypot(dx, dz);
      if (d >= minD || d < 1e-6) continue;
      s.x += (dx / d) * (minD - d); s.z += (dz / d) * (minD - d);
    }
  }
  s.x = Math.max(-cityBound, Math.min(cityBound, s.x));
  s.z = Math.max(-cityBound, Math.min(cityBound, s.z));

  // turn the body toward the direction of travel
  const speed = Math.hypot(s.vx, s.vz);
  if (speed > 0.4) {
    const target = Math.atan2(-s.vx, -s.vz);
    let diff = target - s.bodyYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.bodyYaw += diff * Math.min(1, TURN_RATE * dt);
  }
  return { speed };
}

/** Distance along a ray (from `o`, unit direction `d`) to the first box it hits, or `max`. */
export function rayToBoxes(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  max: number, boxes: Box[],
): number {
  let best = max;
  for (const b of boxes) {
    // slab test against the box [minX,maxX] x [0,height] x [minZ,maxZ]
    let tmin = 0, tmax = best;
    const axes: [number, number, number, number][] = [
      [ox, dx, b.minX, b.maxX], [oy, dy, 0, b.height], [oz, dz, b.minZ, b.maxZ],
    ];
    let hit = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { hit = false; break; }
        continue;
      }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) { hit = false; break; }
    }
    if (hit && tmin < best) best = tmin;
  }
  return best;
}

export const TPV_MIN_DIST = 1.8;
export const TPV_MAX_DIST = 10;
