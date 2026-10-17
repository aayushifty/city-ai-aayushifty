import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, X } from 'lucide-react';
import { AgentCharacter, Building, PlayerState, RoadSegment } from '../../../simulation/types';
import { PANEL, statusHex, useLiveData } from './useCityLiveData';
import { DistrictZone } from '../../../simulation/districts';

/**
 * GTA-style radar: drawn from the same roads, buildings and citizen positions as the 3D scene,
 * rotated so your heading always points up. Citizen dots use their real backend status colour.
 * Click it (or press N) for the full city map, where clicking a citizen opens 2-way comms.
 */

const ROAD_WIDTH = 5.2;

/** Named workplaces (not houses/apartments) get labels and are used for "where am I". */
export function isLandmark(b: Building): boolean {
  return b.id.startsWith('bld-') && !['PARK_SPACE', 'HOUSE', 'APARTMENT'].includes(b.type);
}
export const shortName = (name: string) => name.split('(')[0].trim();
const RADAR_SIZE = 184;          // css px
const RADAR_UNITS = 78;          // world units across the radar

interface Props {
  buildings: Building[];
  roads: RoadSegment[];
  agents: AgentCharacter[];
  player: PlayerState;
  onSelectCitizen: (id: string) => void;
  locationName: string;
  openSignal?: number;   // bump to open the full map (e.g. from the phone)
  zones: DistrictZone[];
}

type Projector = (x: number, z: number) => [number, number];

function drawZones(ctx: CanvasRenderingContext2D, project: Projector, zones: DistrictZone[]) {
  for (const z of zones) {
    const pts = [project(z.cx - z.half, z.cz - z.half), project(z.cx + z.half, z.cz - z.half), project(z.cx + z.half, z.cz + z.half), project(z.cx - z.half, z.cz + z.half)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = z.color + '33';
    ctx.fill();
    ctx.strokeStyle = z.color + 'AA';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawWorld(
  ctx: CanvasRenderingContext2D, project: Projector, scale: number,
  buildings: Building[], roads: RoadSegment[],
) {
  // roads
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(148,163,184,0.55)';
  ctx.lineWidth = ROAD_WIDTH * scale;
  ctx.beginPath();
  for (const r of roads) {
    const [ax, ay] = project(r.start[0], r.start[1]);
    const [bx, by] = project(r.end[0], r.end[1]);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  // buildings as rotated footprints (the map may itself be rotated)
  for (const b of buildings) {
    if (b.type === 'PARK_SPACE') ctx.fillStyle = 'rgba(52,211,153,0.28)';
    else ctx.fillStyle = 'rgba(30,41,59,0.92)';
    const hw = b.width / 2, hd = b.depth / 2;
    const pts = [project(b.x - hw, b.z - hd), project(b.x + hw, b.z - hd), project(b.x + hw, b.z + hd), project(b.x - hw, b.z + hd)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    if (isLandmark(b)) {
      ctx.strokeStyle = (b.accentColor || '#38BDF8') + 'AA';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.8);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(-size * 0.72, size * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#FBBF24';
  ctx.strokeStyle = '#0B1220';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export const MiniMap: React.FC<Props> = ({ buildings, roads, agents, player, onSelectCitizen, locationName, openSignal, zones }) => {
  const live = useLiveData();
  const radarRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (openSignal) setExpanded(true); }, [openSignal]);

  const statusById = useMemo(() => {
    const m = new Map<string, string>();
    live.citizens.forEach(c => m.set(c.id, c.status));
    return m;
  }, [live.citizens]);

  // [N] toggles the full map (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key.toLowerCase() === 'n' && !e.repeat) {
        if (document.pointerLockElement) document.exitPointerLock();
        setExpanded(v => !v);
      } else if (e.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // radar: player-centred, rotated so the heading points up
  useEffect(() => {
    const canvas = radarRef.current;
    if (!canvas) return;
    const ctx = setupCanvas(canvas, RADAR_SIZE, RADAR_SIZE);
    const scale = RADAR_SIZE / RADAR_UNITS;
    const c = RADAR_SIZE / 2;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) in world x/z
    const project: Projector = (x, z) => {
      const dx = x - player.x, dz = z - player.z;
      const fwd = -dx * sin - dz * cos;
      const right = dx * cos - dz * sin;
      return [c + right * scale, c - fwd * scale];
    };

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(0, 0, RADAR_SIZE, RADAR_SIZE);
    drawZones(ctx, project, zones);
    drawWorld(ctx, project, scale, buildings, roads);

    for (const ag of agents) {
      const [x, y] = project(ag.x, ag.z);
      if (x < -6 || y < -6 || x > RADAR_SIZE + 6 || y > RADAR_SIZE + 6) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = statusHex(statusById.get(ag.id));
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0B1220';
      ctx.stroke();
    }

    // north marker on the rim
    const [nx, ny] = project(player.x, player.z - 1000);
    const ang = Math.atan2(ny - c, nx - c);
    const rx = c + Math.cos(ang) * (c - 11), ry = c + Math.sin(ang) * (c - 11);
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0B1220';
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 10px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', rx, ry + 0.5);

    drawArrow(ctx, c, c, 0, 8);
  }, [player.x, player.z, player.yaw, agents, buildings, roads, statusById, zones]);

  return (
    <>
      <div className="pointer-events-auto select-none">
        <button
          type="button"
          onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setExpanded(true); }}
          className={`${PANEL} block p-1.5 overflow-hidden hover:border-white/25 transition`}
          title="Open the city map [N]"
        >
          <canvas
            ref={radarRef}
            className="rounded-xl block w-[136px] h-[136px] sm:w-[184px] sm:h-[184px]"
          />
        </button>
        <div className="mt-1.5 px-2 py-1 rounded-lg bg-slate-950/55 backdrop-blur border border-white/10 text-[10px] text-slate-200 font-semibold tracking-wide max-w-[196px] flex items-center gap-1.5">
          <span className="truncate">{locationName}</span>
          <span className="ml-auto shrink-0 font-mono font-normal text-slate-400">{player.x.toFixed(0)}, {player.z.toFixed(0)}</span>
        </div>
      </div>

      {expanded && (
        <FullMap
          buildings={buildings}
          roads={roads}
          agents={agents}
          player={player}
          statusById={statusById}
          zones={zones}
          onClose={() => setExpanded(false)}
          onSelectCitizen={(id) => { setExpanded(false); onSelectCitizen(id); }}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------------------------

interface FullMapProps {
  buildings: Building[];
  roads: RoadSegment[];
  agents: AgentCharacter[];
  player: PlayerState;
  statusById: Map<string, string>;
  zones: DistrictZone[];
  onClose: () => void;
  onSelectCitizen: (id: string) => void;
}

const FullMap: React.FC<FullMapProps> = ({ buildings, roads, agents, player, statusById, zones, onClose, onSelectCitizen }) => {
  const live = useLiveData();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const projRef = useRef<{ project: Projector; scale: number } | null>(null);

  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const take = (x: number, z: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
    roads.forEach(r => { take(r.start[0], r.start[1]); take(r.end[0], r.end[1]); });
    buildings.forEach(b => { take(b.x - b.width / 2, b.z - b.depth / 2); take(b.x + b.width / 2, b.z + b.depth / 2); });
    if (!isFinite(minX)) return { minX: -80, maxX: 80, minZ: -80, maxZ: 80 };
    return { minX: minX - 8, maxX: maxX + 8, minZ: minZ - 8, maxZ: maxZ + 8 };
  }, [buildings, roads]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 10) return;
    const ctx = setupCanvas(canvas, size.w, size.h);
    const scale = Math.min(size.w / (bounds.maxX - bounds.minX), size.h / (bounds.maxZ - bounds.minZ));
    const ox = (size.w - (bounds.maxX - bounds.minX) * scale) / 2;
    const oy = (size.h - (bounds.maxZ - bounds.minZ) * scale) / 2;
    const project: Projector = (x, z) => [ox + (x - bounds.minX) * scale, oy + (z - bounds.minZ) * scale];
    projRef.current = { project, scale };

    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fillRect(0, 0, size.w, size.h);
    drawZones(ctx, project, zones);
    drawWorld(ctx, project, scale, buildings, roads);
    // district names along the top edge of each zone
    ctx.font = '800 12px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const z of zones) {
      const [x, y] = project(z.cx, z.cz - z.half);
      ctx.fillStyle = z.color;
      ctx.fillText(z.name.toUpperCase(), x, y + 9);
    }

    // workplace labels
    ctx.font = '600 11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of buildings) {
      if (!isLandmark(b)) continue;
      const [x, y] = project(b.x, b.z);
      let label = shortName(b.name);
      const maxW = 26 * scale;  // a city block is 28 units wide
      while (label.length > 4 && ctx.measureText(label).width > maxW) label = label.slice(0, -2).trimEnd() + '…';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(2,6,23,0.7)';
      ctx.fillRect(x - w / 2, y - 8, w, 16);
      ctx.fillStyle = 'rgba(226,232,240,0.95)';
      ctx.fillText(label, x, y);
    }

    for (const ag of agents) {
      const [x, y] = project(ag.x, ag.z);
      const isHover = hover === ag.id;
      ctx.beginPath();
      ctx.arc(x, y, isHover ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = statusHex(statusById.get(ag.id));
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isHover ? '#FBBF24' : '#0B1220';
      ctx.stroke();
      if (isHover) {
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(ag.name, x, y - 14);
      }
    }
    const [px, py] = project(player.x, player.z);
    // forward = (-sin yaw, -cos yaw) and screen y grows with z, so the up-pointing arrow turns by -yaw
    drawArrow(ctx, px, py, -player.yaw, 10);
  }, [size, bounds, buildings, roads, agents, player.x, player.z, player.yaw, statusById, hover, zones]);

  const pick = (e: React.MouseEvent): string | null => {
    const p = projRef.current;
    const canvas = canvasRef.current;
    if (!p || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: string | null = null, bestD = 12;
    for (const ag of agents) {
      const [x, y] = p.project(ag.x, ag.z);
      const d = Math.hypot(x - mx, y - my);
      if (d < bestD) { bestD = d; best = ag.id; }
    }
    return best;
  };

  const legend: [string, string][] = [['IDLE', 'Idle'], ['PLANNING', 'Planning'], ['WORKING', 'Working'], ['VERIFYING', 'Verifying'], ['FAILED', 'Failed']];

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8 pointer-events-auto" onClick={onClose}>
      <div className={`${PANEL} w-full max-w-6xl h-full max-h-[86vh] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100 tracking-wide">
            <MapIcon size={16} className="text-amber-300" /> City Map
            {!live.online && <span className="text-[10px] font-semibold text-red-300 ml-2">backend offline: statuses unknown</span>}
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-300">
            {legend.map(([s, l]) => (
              <span key={s} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: statusHex(s) }} />{l}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[9px] border-l-transparent border-r-transparent border-b-amber-400" />You</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" title="Close [N / Esc]"><X size={16} /></button>
        </div>
        <div ref={boxRef} className="relative flex-1 min-h-0">
          <canvas
            ref={canvasRef}
            style={{ cursor: hover ? 'pointer' : 'default' }}
            className="absolute inset-0 w-full h-full"
            onMouseMove={e => setHover(pick(e))}
            onMouseLeave={() => setHover(null)}
            onClick={e => { const id = pick(e); if (id) onSelectCitizen(id); }}
          />
        </div>
        <div className="px-4 py-1.5 border-t border-white/10 text-[10px] text-slate-400">
          Click a citizen to open 2-way comms. Dot colours are each citizen's live backend status.
        </div>
      </div>
    </div>
  );
};
