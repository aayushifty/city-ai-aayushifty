import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Draw-call reduction for static, plain-coloured geometry. Meshes whose material has no textures are
 * grouped by "look" (material type, roughness, metalness, emissive, opacity, side), their colour is
 * baked into vertex colours, and each group is merged into one mesh. Textured meshes (signs) and
 * anything `skip` returns true for (e.g. rotating holograms) are left untouched.
 *
 * WebGL draw calls are expensive on the CPU: the city went from ~2,900 calls per frame to a few hundred.
 */

type Plain = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

function isPlain(m: THREE.Material): m is Plain {
  const any = m as any;
  if (!(any.isMeshStandardMaterial || any.isMeshBasicMaterial || any.isMeshLambertMaterial || any.isMeshPhongMaterial)) return false;
  if (any.isMeshPhysicalMaterial) return false;
  return !any.map && !any.emissiveMap && !any.alphaMap && !any.normalMap && !any.roughnessMap && !any.metalnessMap &&
    !any.envMap && !any.lightMap && !any.aoMap && !any.vertexColors && !any.wireframe;
}

function lookKey(m: Plain): string {
  const any = m as any;
  const q = (v: number | undefined) => (v === undefined ? '-' : Math.round(v * 20) / 20);
  return [
    m.type, q(any.roughness), q(any.metalness),
    any.emissive ? any.emissive.getHexString() : '-', q(any.emissiveIntensity),
    m.transparent ? `t${q(m.opacity)}` : 'o', m.side, any.flatShading ? 'f' : 's',
    m.depthWrite ? 'dw' : 'nodw', m.fog ? 'fog' : 'nofog', any.toneMapped === false ? 'notm' : 'tm',
  ].join('|');
}

function prepare(mesh: THREE.Mesh, toRoot: THREE.Matrix4, color: THREE.Color): THREE.BufferGeometry {
  let g = mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  g.morphAttributes = {};
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(toRoot);
  // mirrored transforms flip winding; un-index so every merge input has the same layout
  if (g.index) g = g.toNonIndexed();
  if (toRoot.determinant() < 0) {
    // mirrored transform: swap two corners of every triangle so faces keep pointing outward
    for (const name of ['position', 'normal']) {
      const attr = g.attributes[name] as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let t = 0; t < arr.length; t += 9) {
        for (let k = 0; k < 3; k++) { const tmp = arr[t + 3 + k]; arr[t + 3 + k] = arr[t + 6 + k]; arr[t + 6 + k] = tmp; }
      }
      attr.needsUpdate = true;
    }
  }
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.clearGroups();
  return g;
}

/**
 * Merges static plain meshes below `root` into per-look meshes added directly to `root`.
 * `skip(obj)` excludes an object and its whole subtree. Returns how many meshes were merged.
 */
export function batchStatic(root: THREE.Object3D, skip: (o: THREE.Object3D) => boolean = () => false): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: Plain; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();

  const visit = (o: THREE.Object3D) => {
    if (o !== root && skip(o)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as any).isInstancedMesh && !(mesh as any).isSkinnedMesh && mesh.visible && !Array.isArray(mesh.material) && isPlain(mesh.material as THREE.Material)) {
      const mat = mesh.material as Plain;
      const key = lookKey(mat);
      let g = groups.get(key);
      if (!g) { g = { material: mat, geos: [], meshes: [], cast: false, receive: false }; groups.set(key, g); }
      const toRoot = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      g.geos.push(prepare(mesh, toRoot, (mat as any).color || new THREE.Color(1, 1, 1)));
      g.meshes.push(mesh);
      g.cast ||= mesh.castShadow;
      g.receive ||= mesh.receiveShadow;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  let merged = 0;
  groups.forEach(g => {
    if (g.meshes.length < 2) { g.geos.forEach(x => x.dispose()); return; }
    const geo = mergeGeometries(g.geos);
    g.geos.forEach(x => x.dispose());
    if (!geo) return;
    const mat = g.material.clone() as Plain;
    (mat as any).color?.set(0xFFFFFF);
    mat.vertexColors = true;
    const out = new THREE.Mesh(geo, mat);
    out.castShadow = g.cast;
    out.receiveShadow = g.receive;
    out.userData.batched = true;
    for (const m of g.meshes) m.removeFromParent();
    root.add(out);
    merged += g.meshes.length;
  });
  return merged;
}
