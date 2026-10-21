/**
 * The five named work districts. Each one is the city block around an existing workplace, so the
 * citizens who work there (and their real tasks) belong to that district.
 */
export interface District {
  id: 'research' | 'development' | 'design' | 'analytics' | 'deployment';
  name: string;
  tagline: string;
  color: string;          // ground tint / signage / map colour
  buildingId: string;     // the workplace that anchors the district
}

export const DISTRICTS: District[] = [
  { id: 'research', name: 'Research District', tagline: 'Specs, research & architecture', color: '#22D3EE', buildingId: 'bld-blueprint' },
  { id: 'development', name: 'Development District', tagline: 'Code fabrication & web apps', color: '#F97316', buildingId: 'bld-foundry' },
  { id: 'design', name: 'Design District', tagline: 'Product vision & 3D design', color: '#A78BFA', buildingId: 'bld-vision-lab' },
  { id: 'analytics', name: 'Analytics District', tagline: 'Diagnostics & data', color: '#84CC16', buildingId: 'bld-diagnostic' },
  { id: 'deployment', name: 'Deployment District', tagline: 'Release, CI/CD & operations', color: '#3B82F6', buildingId: 'bld-release-dock' },
];

/** Square block interior around a workplace (blocks are 28 units, the inner lot is ~20 units). */
export const BLOCK_SPACING = 28;
export const BLOCK_INNER_HALF = 10.2;

export interface DistrictZone extends District {
  cx: number; cz: number;   // block centre
  half: number;             // half size of the block interior
}

/** Block centre that contains (x, z), given the road grid's intersection coordinates. */
export function blockCenterFor(x: number, z: number, gridXs: number[], gridZs: number[]): [number, number] | null {
  const find = (v: number, grid: number[]) => {
    for (let i = 0; i < grid.length - 1; i++) if (v >= grid[i] && v <= grid[i + 1]) return (grid[i] + grid[i + 1]) / 2;
    return null;
  };
  const cx = find(x, gridXs), cz = find(z, gridZs);
  return cx === null || cz === null ? null : [cx, cz];
}

export function districtZones(
  buildings: { id: string; x: number; z: number }[],
  intersections: { x: number; z: number }[],
): DistrictZone[] {
  const xs = [...new Set(intersections.map(i => i.x))].sort((a, b) => a - b);
  const zs = [...new Set(intersections.map(i => i.z))].sort((a, b) => a - b);
  const zones: DistrictZone[] = [];
  for (const d of DISTRICTS) {
    const b = buildings.find(bb => bb.id === d.buildingId);
    if (!b) continue;
    const c = blockCenterFor(b.x, b.z, xs, zs);
    if (c) zones.push({ ...d, cx: c[0], cz: c[1], half: BLOCK_INNER_HALF });
  }
  return zones;
}

export function districtAt(x: number, z: number, zones: DistrictZone[]): DistrictZone | null {
  for (const zn of zones) {
    if (Math.abs(x - zn.cx) <= zn.half + 4 && Math.abs(z - zn.cz) <= zn.half + 4) return zn;
  }
  return null;
}
