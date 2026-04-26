// Generates a custom sports-coupe GLB at public/models/cars/car_apex_rush.glb
// using the existing Kenney `Textures/colormap.png` so the model picks up the
// shared palette. Re-run with `node scripts/buildSportsCoupe.mjs` if the
// geometry needs tweaking.
//
// Geometry conventions (matching Kenney cars):
//  - +Z is forward, +Y is up.
//  - Output sits roughly in y=[0.05, 0.85], x=[-0.55, 0.55], z=[-1.10, 1.10]
//    so `useFitLength(scene, 4)` scales it the same way as the other cars.
//  - One material `colormap` with a baseColorTexture pointing to
//    `Textures/colormap.png` (relative to the GLB).
//  - Body panels sample a WHITE colormap cell so CarModel's runtime tint
//    multiplies cleanly. Glass panels sample a near-black cell so they stay
//    dark regardless of tint.
//  - Wheel meshes are named `wheel-*-{left,right}` so CarModel's wheel-spin
//    detection picks them up.
//
// Winding: every face is authored via `quadOriented` / `polyOriented`, which
// take an explicit outward direction and flip the vertex order if the
// computed normal disagrees. That eliminates whole-class winding bugs and
// keeps the script easy to extend.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------- colormap UV picks (16x16 palette, cell center = (c+0.5)/16) ----
const cellUV = (col, row) => [(col + 0.5) / 16, (row + 0.5) / 16];
const UV_BODY    = cellUV(12, 8);  // pure white -> tints clean
const UV_GLASS   = cellUV(2, 8);   // #38383d very dark blue-gray
const UV_TIRE    = cellUV(2, 10);  // dark gray, matches Kenney tire palette
const UV_RIM     = cellUV(12, 8);  // white rim (tints with body)
const UV_HEADLIGHT = cellUV(12, 8); // white -> tints, but kept on tiny faces
const UV_TAILLIGHT = cellUV(4, 12); // bright red (#de433e)
const UV_ACCENT  = cellUV(2, 8);   // dark accent for spoiler / lower trim

// ---------- mesh authoring helpers --------------------------------------
class MeshBuilder {
  constructor(name) {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  // Add a triangle without orientation handling. Caller must ensure the
  // listed order yields the desired outward normal via right-hand rule.
  triRaw(a, b, c, uvA, uvB, uvC) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    const cx = c[0], cy = c[1], cz = c[2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.positions.length / 3;
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    this.indices.push(base, base + 1, base + 2);
  }

  // Quad with explicit outward direction. Vertices are listed in any sane
  // perimeter order (typically CCW from +outward) — if the computed normal
  // disagrees with `outward`, the order is reversed before emission.
  quadOriented(p0, p1, p2, p3, uv, outward) {
    if (this._normalAgreesWith([p0, p1, p2], outward)) {
      this.triRaw(p0, p1, p2, uv, uv, uv);
      this.triRaw(p0, p2, p3, uv, uv, uv);
    } else {
      // Reverse winding by swapping the middle two vertices.
      this.triRaw(p0, p2, p1, uv, uv, uv);
      this.triRaw(p0, p3, p2, uv, uv, uv);
    }
  }

  // Convex polygon with explicit outward direction. Fan-triangulated.
  polyOriented(points, uv, outward) {
    const pts = this._normalAgreesWith([points[0], points[1], points[2]], outward)
      ? points
      : points.slice().reverse();
    for (let i = 1; i < pts.length - 1; i++) {
      this.triRaw(pts[0], pts[i], pts[i + 1], uv, uv, uv);
    }
  }

  _normalAgreesWith([a, b, c], outward) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    return nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0;
  }
}

// ---------- sports coupe body -------------------------------------------
// Side profile, walked CCW in YZ (z increasing rightward, y up). Strictly
// convex so polyOriented's fan triangulation lands inside the silhouette.
// Each entry is [z, y].
const halfWidth = 0.55;
const upperProfile = [
  [ 1.10, 0.05], // 0 front bumper bottom
  [ 1.10, 0.22], // 1 front bumper top
  [ 0.90, 0.40], // 2 hood front
  [ 0.20, 0.50], // 3 hood rear / windshield base
  [-0.10, 0.78], // 4 windshield top / cabin front
  [-0.55, 0.82], // 5 roof rear / cabin rear
  [-0.95, 0.55], // 6 rear window bottom
  [-1.10, 0.35], // 7 trunk rear top
  [-1.10, 0.05], // 8 rear bumper bottom
];

// Per-segment UV picks: indices map "segment i = profile[i] -> profile[i+1]"
// to a UV. Segments not listed default to UV_BODY. The closing segment
// (last -> first) is the underside.
const SEG_UV = {
  3: UV_GLASS,  // segment 3->4 = windshield
  5: UV_GLASS,  // segment 5->6 = rear window
};
const UNDERSIDE_UV = UV_ACCENT;

const body = new MeshBuilder('body');

// Top + side bands. For each profile segment (i, i+1), emit a quad spanning
// ±halfWidth and orient it outward. The outward direction in YZ is the right
// perpendicular of the segment tangent (since we walk CCW with interior on
// the left): tangent (dz, dy) -> outward (dy, -dz) — i.e. world (0, dy, -dz)
// rebuilt as (0, dy, -dz) once we account for the YZ embedding.
//
// Wait — careful with axes. Our profile is (z, y) and CCW in math plane
// means we list z increasing first then y rises. The right-perp of tangent
// (dz, dy) is (dy, -dz) in (z, y) — so the outward in 3D is
// (0, -dz, dy_in_z?) no, let me be exact:
//
// Tangent vector in 3D: (0, dy, dz). Right-perp (rotated CW around +X) of a
// 2D vector (dz, dy) is (dy, -dz) in (z, y) coords — i.e. in 3D:
//   (0, -dz, dy)? No. (z component, y component) = (dy, -dz) means the new
//   z-component is dy and the new y-component is -dz. In 3D that's
//   (0, -dz, dy).
// Sanity: segment 0 has tangent (0, 0, 0.17) (dz=0, dy=0.17). Outward = (0, 0, 0.17). +Z. ✓
// Segment "underside" (last -> first) tangent (0, 0, +2.20). Outward = (0, -2.20, 0). -Y. ✓
const segCount = upperProfile.length;
for (let i = 0; i < segCount; i++) {
  const [z0, y0] = upperProfile[i];
  const [z1, y1] = upperProfile[(i + 1) % segCount];
  const isUnderside = i === segCount - 1;
  const uv = isUnderside ? UNDERSIDE_UV : (SEG_UV[i] || UV_BODY);
  const dy = y1 - y0;
  const dz = z1 - z0;
  // Outward in 3D: (0, -dz, dy). Length is segment length but only direction
  // matters for the orientation check.
  const outward = [0, -dz, dy];
  body.quadOriented(
    [-halfWidth, y0, z0],
    [ halfWidth, y0, z0],
    [ halfWidth, y1, z1],
    [-halfWidth, y1, z1],
    uv,
    outward,
  );
}

// Side caps: full silhouette polygon at ±halfWidth.
{
  const points = upperProfile.map(([z, y]) => [y, z]); // unused, just clarity
  void points;
  const rightPts = upperProfile.map(([z, y]) => [ halfWidth, y, z]);
  const leftPts  = upperProfile.map(([z, y]) => [-halfWidth, y, z]);
  body.polyOriented(rightPts, UV_BODY, [+1, 0, 0]);
  body.polyOriented(leftPts,  UV_BODY, [-1, 0, 0]);
}

// Headlight pads — small bright rectangles slightly forward of the front
// bumper face. Z is bumped past z=1.10 a hair so they paint over the
// underlying body band.
{
  const z = 1.101;
  const yLo = 0.10, yHi = 0.20;
  const slots = [
    { xL: -0.45, xR: -0.20 },
    { xL:  0.20, xR:  0.45 },
  ];
  for (const s of slots) {
    body.quadOriented(
      [s.xL, yLo, z], [s.xR, yLo, z], [s.xR, yHi, z], [s.xL, yHi, z],
      UV_HEADLIGHT, [0, 0, 1],
    );
  }
}

// Taillight strips on the rear face.
{
  const z = -1.101;
  const yLo = 0.12, yHi = 0.22;
  const slots = [
    { xL: -0.45, xR: -0.20 },
    { xL:  0.20, xR:  0.45 },
  ];
  for (const s of slots) {
    body.quadOriented(
      [s.xL, yLo, z], [s.xR, yLo, z], [s.xR, yHi, z], [s.xL, yHi, z],
      UV_TAILLIGHT, [0, 0, -1],
    );
  }
}

// ---------- spoiler -----------------------------------------------------
// Rear wing: a flat horizontal blade on two short uprights mounted to the
// trunk lid (segment 6, point7=(-1.10, 0.35) area).
const spoiler = new MeshBuilder('spoiler');
function box(builder, [x0, y0, z0], [x1, y1, z1], uv) {
  // Six axis-aligned faces.
  // +Z face
  builder.quadOriented([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv, [0, 0, 1]);
  // -Z face
  builder.quadOriented([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], uv, [0, 0, -1]);
  // +Y face
  builder.quadOriented([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], uv, [0, 1, 0]);
  // -Y face
  builder.quadOriented([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv, [0, -1, 0]);
  // +X face
  builder.quadOriented([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], uv, [1, 0, 0]);
  // -X face
  builder.quadOriented([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], uv, [-1, 0, 0]);
}
{
  // Blade
  box(spoiler, [-0.42, 0.62, -1.05], [ 0.42, 0.66, -0.85], UV_ACCENT);
  // Uprights (left + right pillars)
  box(spoiler, [-0.40, 0.50, -0.99], [-0.32, 0.62, -0.91], UV_ACCENT);
  box(spoiler, [ 0.32, 0.50, -0.99], [ 0.40, 0.62, -0.91], UV_ACCENT);
}

// ---------- wheels ------------------------------------------------------
const WHEEL_RADIUS = 0.30;
const WHEEL_HALF_THICK = 0.10;
const WHEEL_SIDES = 12;

function buildWheel(name, isLeft) {
  const m = new MeshBuilder(name);
  // Outer cap is the visible-from-the-side face. Right wheel sits at -X in
  // world, so its outer face is at -X (xOuter = -t). Left wheel mirrors.
  const xOuter = isLeft ? +WHEEL_HALF_THICK : -WHEEL_HALF_THICK;
  const xInner = -xOuter;
  const verts = [];
  for (let i = 0; i < WHEEL_SIDES; i++) {
    const a = (i / WHEEL_SIDES) * Math.PI * 2;
    verts.push([Math.cos(a) * WHEEL_RADIUS, Math.sin(a) * WHEEL_RADIUS]);
  }
  // Tread bands: each segment = quad with outward direction = radial.
  for (let i = 0; i < WHEEL_SIDES; i++) {
    const [y0, z0] = verts[i];
    const [y1, z1] = verts[(i + 1) % WHEEL_SIDES];
    // Radial outward at the segment midpoint (averaging endpoint normals).
    const my = (y0 + y1) * 0.5;
    const mz = (z0 + z1) * 0.5;
    const len = Math.hypot(my, mz) || 1;
    const outward = [0, my / len, mz / len];
    m.quadOriented(
      [xOuter, y0, z0],
      [xInner, y0, z0],
      [xInner, y1, z1],
      [xOuter, y1, z1],
      UV_TIRE,
      outward,
    );
  }
  // Outer cap (visible hub face).
  {
    const pts = verts.map(([y, z]) => [xOuter, y, z]);
    m.polyOriented(pts, UV_RIM, [Math.sign(xOuter), 0, 0]);
  }
  // Inner cap (back of wheel). Sealed with tire color so the wheel-well
  // shadow disguises it.
  {
    const pts = verts.map(([y, z]) => [xInner, y, z]);
    m.polyOriented(pts, UV_TIRE, [Math.sign(xInner), 0, 0]);
  }
  return m;
}

const wheelFL = buildWheel('wheel-front-left',  true);
const wheelFR = buildWheel('wheel-front-right', false);
const wheelBL = buildWheel('wheel-back-left',   true);
const wheelBR = buildWheel('wheel-back-right',  false);

// Wheel node translations.
const WHEEL_X = 0.45;
const WHEEL_Y = WHEEL_RADIUS;
const WHEEL_Z_FRONT = 0.78;
const WHEEL_Z_BACK = -0.78;

const meshes = [
  { name: 'body',    mesh: body,    t: [0, 0, 0] },
  { name: 'spoiler', mesh: spoiler, t: [0, 0, 0] },
  { name: 'wheel-front-left',  mesh: wheelFL, t: [ WHEEL_X, WHEEL_Y,  WHEEL_Z_FRONT] },
  { name: 'wheel-front-right', mesh: wheelFR, t: [-WHEEL_X, WHEEL_Y,  WHEEL_Z_FRONT] },
  { name: 'wheel-back-left',   mesh: wheelBL, t: [ WHEEL_X, WHEEL_Y,  WHEEL_Z_BACK ] },
  { name: 'wheel-back-right',  mesh: wheelBR, t: [-WHEEL_X, WHEEL_Y,  WHEEL_Z_BACK ] },
];

// ---------- GLB packing -------------------------------------------------
const accessors = [];
const bufferViews = [];
const gltfMeshes = [];
const binParts = [];
let binOffset = 0;

function pad4(buf, fillByte = 0x00) {
  const rem = buf.byteLength % 4;
  if (rem === 0) return buf;
  const pad = Buffer.alloc(4 - rem, fillByte);
  return Buffer.concat([buf, pad]);
}

function addAccessor({ data, type, componentType, count, target, byteStride, min, max }) {
  const compSize = componentType === 5126 ? 4 : (componentType === 5123 ? 2 : 1);
  while (binOffset % compSize !== 0) {
    binParts.push(Buffer.alloc(1));
    binOffset += 1;
  }
  const byteLength = data.byteLength;
  const bv = { buffer: 0, byteOffset: binOffset, byteLength };
  if (target !== undefined) bv.target = target;
  if (byteStride !== undefined) bv.byteStride = byteStride;
  bufferViews.push(bv);
  binParts.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  binOffset += byteLength;
  const acc = { bufferView: bufferViews.length - 1, componentType, count, type };
  if (min) acc.min = min;
  if (max) acc.max = max;
  accessors.push(acc);
  return accessors.length - 1;
}

function bounds3(arr) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

for (const entry of meshes) {
  const m = entry.mesh;
  const pos = new Float32Array(m.positions);
  const { min: pMin, max: pMax } = bounds3(m.positions);
  const posIdx = addAccessor({
    data: pos, type: 'VEC3', componentType: 5126, count: pos.length / 3,
    target: 34962, byteStride: 12, min: pMin, max: pMax,
  });
  const nrm = new Float32Array(m.normals);
  const nrmIdx = addAccessor({
    data: nrm, type: 'VEC3', componentType: 5126, count: nrm.length / 3,
    target: 34962, byteStride: 12,
  });
  const uvs = new Float32Array(m.uvs);
  const uvIdx = addAccessor({
    data: uvs, type: 'VEC2', componentType: 5126, count: uvs.length / 2,
    target: 34962,
  });
  const idx = new Uint16Array(m.indices);
  const idxIdx = addAccessor({
    data: idx, type: 'SCALAR', componentType: 5123, count: idx.length,
    target: 34963,
  });
  gltfMeshes.push({
    name: m.name,
    primitives: [
      {
        attributes: { POSITION: posIdx, NORMAL: nrmIdx, TEXCOORD_0: uvIdx },
        indices: idxIdx,
        material: 0,
      },
    ],
  });
}

const nodes = meshes.map((entry, i) => {
  const node = { name: entry.name, mesh: i };
  if (entry.t.some((v) => v !== 0)) node.translation = entry.t;
  return node;
});

const gltf = {
  asset: { generator: 'bulldog buildSportsCoupe.mjs', version: '2.0' },
  scene: 0,
  scenes: [{ name: 'sports-coupe', nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes: gltfMeshes,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binOffset }],
  materials: [
    {
      name: 'colormap',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { texCoord: 0 } } },
        metallicFactor: 0,
      },
    },
  ],
  textures: [{ sampler: 0, source: 0, name: 'colormap' }],
  images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
  samplers: [{ minFilter: 9987 }],
  extensionsUsed: ['KHR_texture_transform'],
};

const binChunkData = Buffer.concat(binParts);
gltf.buffers[0].byteLength = binChunkData.byteLength;

const jsonStr = JSON.stringify(gltf);
const jsonChunk = pad4(Buffer.from(jsonStr, 'utf8'), 0x20);
const binChunk = pad4(binChunkData, 0x00);
const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
const out = Buffer.alloc(totalLen);
let o = 0;
out.write('glTF', o); o += 4;
out.writeUInt32LE(2, o); o += 4;
out.writeUInt32LE(totalLen, o); o += 4;
out.writeUInt32LE(jsonChunk.length, o); o += 4;
out.write('JSON', o); o += 4;
jsonChunk.copy(out, o); o += jsonChunk.length;
out.writeUInt32LE(binChunk.length, o); o += 4;
out.write('BIN\0', o, 'binary'); o += 4;
binChunk.copy(out, o); o += binChunk.length;

const outPath = 'public/models/cars/car_apex_rush.glb';
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log('wrote', outPath, 'bytes:', out.length);
console.log('  meshes:', gltfMeshes.length, 'nodes:', nodes.length);
const totalTris = gltfMeshes.reduce(
  (s, m) => s + accessors[m.primitives[0].indices].count / 3,
  0,
);
console.log('  triangles:', totalTris);
