import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  BRIDGE_DECK_SEGMENTS,
  BRIDGE_DECK_THICKNESS,
  BRIDGE_DECK_WIDTH,
  BRIDGE_LENGTH,
  BRIDGE_MID_X,
  BRIDGE_MID_Z,
  BRIDGE_RAILING_HEIGHT,
  BRIDGE_YAW,
  TOWER_HEIGHT,
  TOWER_LEG_D,
  TOWER_LEG_W,
  TOWER_T,
  deckYAt,
} from './bridgeData';

// Renders a Golden-Gate-style suspension bridge between the main island and
// island 3. The deck arcs along a parabola (flat at the ends, peak in the
// middle) so it lifts cars over the water before easing back to grade. Two
// orange towers stand in the water at TOWER_T fractions of the span; main
// cables drape between them in a parabolic catenary, with vertical
// suspenders dropping to the deck.
//
// Collider strategy: every CuboidCollider sits inside ONE RigidBody at the
// world origin and uses world-space coordinates for position + rotation.
// Earlier we tried to inherit the bridge group's yaw via parent matrixWorld
// (and even nested per-segment subgroups for pitch), but @react-three/rapier
// in this project doesn't reliably propagate group transforms to bodies —
// the rest of the codebase (Buildings, Dock, Stadium, Marina, Island) all
// follow the "RigidBody at root, absolute world coords" convention. Visuals
// keep their nested bridge group; only the colliders are flattened to world.

const ROAD_COLOR = '#2d2d33';
const SIDEWALK_COLOR = '#9a9aa3';
const RAILING_COLOR = '#4a4d56';
const LINE_COLOR = '#d8c46a';
// International Orange — Golden Gate's signature color. Slightly desaturated
// vs the real-world spec so it doesn't blow out under noon sun.
const ORANGE = '#c0392b';
const ORANGE_DARK = '#8a2922';
const CABLE_COLOR = '#1a1a20';

const halfLen = BRIDGE_LENGTH / 2;
const halfDeckW = BRIDGE_DECK_WIDTH / 2;
const roadHalfW = 4; // 8m road centered on z=0
const sidewalkW = (BRIDGE_DECK_WIDTH - 8) / 2; // 3m each side
const halfThickness = BRIDGE_DECK_THICKNESS / 2;
const halfRailH = BRIDGE_RAILING_HEIGHT / 2;
const railingT = 0.18;
const halfRailT = railingT / 2;

function localXAt(t: number): number {
  return -halfLen + t * BRIDGE_LENGTH;
}

// --- Frame conversion helper ---

const COS_YAW = Math.cos(BRIDGE_YAW);
const SIN_YAW = Math.sin(BRIDGE_YAW);

// Convert a point in bridge-local space (where +X runs MAIN→I3 along the
// bridge axis, +Y is up, +Z is south of the centerline) to world coords.
// Three.js Y-rotation by θ maps (x, y, z) → (x cos + z sin, y, -x sin + z cos);
// then we shift by the bridge midpoint.
function bridgeToWorld(
  blx: number,
  bly: number,
  blz: number,
): [number, number, number] {
  return [
    blx * COS_YAW + blz * SIN_YAW + BRIDGE_MID_X,
    bly,
    -blx * SIN_YAW + blz * COS_YAW + BRIDGE_MID_Z,
  ];
}

// --- Segment geometry: shared by visuals and the world-space colliders ---

type DeckSegment = {
  centerX: number; // bridge-local X of segment midpoint
  centerY: number; // bridge-local Y of segment midpoint (deck-top mid)
  length: number;  // 3D length of the segment
  pitch: number;   // Z-axis rotation in bridge-local frame (tilts +X end up)
};

function buildDeckSegments(): DeckSegment[] {
  const segs: DeckSegment[] = [];
  for (let i = 0; i < BRIDGE_DECK_SEGMENTS; i++) {
    const t0 = i / BRIDGE_DECK_SEGMENTS;
    const t1 = (i + 1) / BRIDGE_DECK_SEGMENTS;
    const x0 = localXAt(t0);
    const x1 = localXAt(t1);
    const y0 = deckYAt(t0);
    const y1 = deckYAt(t1);
    const dxSeg = x1 - x0;
    const dySeg = y1 - y0;
    segs.push({
      centerX: (x0 + x1) / 2,
      centerY: (y0 + y1) / 2,
      length: Math.hypot(dxSeg, dySeg),
      pitch: Math.atan2(dySeg, dxSeg),
    });
  }
  return segs;
}

const DECK_SEGMENTS_DATA = buildDeckSegments();

// --- Towers ---

const TOWER_LEG_HALF_W = TOWER_LEG_W / 2;
const TOWER_LEG_HALF_D = TOWER_LEG_D / 2;
const TOWER_LEG_BASE_Y = -2;
const TOWER_LEG_TOP_Y = TOWER_HEIGHT;
const TOWER_LEG_HEIGHT = TOWER_LEG_TOP_Y - TOWER_LEG_BASE_Y;
const TOWER_LEG_CENTER_Y = (TOWER_LEG_BASE_Y + TOWER_LEG_TOP_Y) / 2;
const TOWER_LEG_CENTER_Z = halfDeckW + TOWER_LEG_D / 2 + 0.5;

type TowerData = {
  centerX: number;
  deckY: number;
};

const TOWERS: TowerData[] = TOWER_T.map((t) => ({
  centerX: localXAt(t),
  deckY: deckYAt(t),
}));

function TowerVisual({ centerX, deckY }: TowerData) {
  const crossbars: Array<{ y: number; thickness: number }> = [
    { y: deckY - 4, thickness: 1.6 },
    { y: deckY + 6, thickness: 1.4 },
    { y: TOWER_LEG_TOP_Y - 3, thickness: 1.8 },
  ];
  return (
    <group position={[centerX, 0, 0]}>
      {[-TOWER_LEG_CENTER_Z, TOWER_LEG_CENTER_Z].map((zz, i) => (
        <mesh key={`leg_${i}`} position={[0, TOWER_LEG_CENTER_Y, zz]} castShadow receiveShadow>
          <boxGeometry args={[TOWER_LEG_W, TOWER_LEG_HEIGHT, TOWER_LEG_D]} />
          <meshStandardMaterial color={ORANGE} />
        </mesh>
      ))}
      {crossbars.map((cb, i) => (
        <mesh key={`cb_${i}`} position={[0, cb.y, 0]} castShadow>
          <boxGeometry args={[TOWER_LEG_W * 0.85, cb.thickness, TOWER_LEG_CENTER_Z * 2]} />
          <meshStandardMaterial color={ORANGE} />
        </mesh>
      ))}
    </group>
  );
}

// --- Main cables ---

const CABLE_RADIUS = 0.35;
const CABLE_SAMPLES = 32;

type Vec3T = [number, number, number];

function parabolaSamples(start: Vec3T, end: Vec3T, sag: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= CABLE_SAMPLES; i++) {
    const t = i / CABLE_SAMPLES;
    const sx = start[0] + (end[0] - start[0]) * t;
    const sy = start[1] + (end[1] - start[1]) * t;
    const sz = start[2] + (end[2] - start[2]) * t;
    const droop = 4 * sag * t * (1 - t);
    out.push(new THREE.Vector3(sx, sy - droop, sz));
  }
  return out;
}

function MainCable({ side }: { side: 'north' | 'south' }) {
  const z = side === 'north' ? -halfDeckW : halfDeckW;
  const towerTopY = TOWER_LEG_TOP_Y - 2;
  const tower1X = localXAt(TOWER_T[0]);
  const tower2X = localXAt(TOWER_T[1]);
  const deckMainY = deckYAt(0) + 1.5;
  const deckI3Y = deckYAt(1) + 1.5;
  const deckMidY = deckYAt(0.5);

  const sections: Array<{ start: Vec3T; end: Vec3T; sag: number }> = [
    { start: [-halfLen, deckMainY, z], end: [tower1X, towerTopY, z], sag: 4 },
    {
      start: [tower1X, towerTopY, z],
      end: [tower2X, towerTopY, z],
      sag: towerTopY - (deckMidY + 5),
    },
    { start: [tower2X, towerTopY, z], end: [halfLen, deckI3Y, z], sag: 4 },
  ];

  const tubes = useMemo(() => {
    return sections.map((s) => {
      const points = parabolaSamples(s.start, s.end, s.sag);
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, CABLE_SAMPLES, CABLE_RADIUS, 6, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {tubes.map((g, i) => (
        <mesh key={`cable_${side}_${i}`} geometry={g} castShadow>
          <meshStandardMaterial color={CABLE_COLOR} />
        </mesh>
      ))}
    </>
  );
}

// --- Suspenders ---

const SUSPENDER_SPACING = 14;
const SUSPENDER_RADIUS = 0.08;

type Suspender = { x: number; topY: number; deckY: number; side: number };

function buildSuspenders(): Suspender[] {
  const out: Suspender[] = [];
  const tower1X = localXAt(TOWER_T[0]);
  const tower2X = localXAt(TOWER_T[1]);
  const towerTopY = TOWER_LEG_TOP_Y - 2;

  const cableYBetweenTowers = (x: number): number => {
    const span = tower2X - tower1X;
    const t = (x - tower1X) / span;
    const deckMidY = deckYAt(0.5);
    const sag = towerTopY - (deckMidY + 5);
    return towerTopY - 4 * sag * t * (1 - t);
  };

  const cableYBackstay = (
    x: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    sag: number,
  ): number => {
    const t = (x - startX) / (endX - startX);
    const lerped = startY + (endY - startY) * t;
    return lerped - 4 * sag * t * (1 - t);
  };

  for (let x = -halfLen + 8; x <= halfLen - 8; x += SUSPENDER_SPACING) {
    if (Math.abs(x - tower1X) < TOWER_LEG_W) continue;
    if (Math.abs(x - tower2X) < TOWER_LEG_W) continue;
    let topY: number;
    if (x < tower1X) {
      topY = cableYBackstay(x, -halfLen, deckYAt(0) + 1.5, tower1X, towerTopY, 4);
    } else if (x > tower2X) {
      topY = cableYBackstay(x, tower2X, towerTopY, halfLen, deckYAt(1) + 1.5, 4);
    } else {
      topY = cableYBetweenTowers(x);
    }
    const t = (x + halfLen) / BRIDGE_LENGTH;
    const dY = deckYAt(t) + 0.9;
    if (topY - dY < 1) continue;
    for (const sd of [-1, 1]) {
      out.push({ x, topY, deckY: dY, side: sd });
    }
  }
  return out;
}

const SUSPENDERS = buildSuspenders();

// --- Visual deck pieces ---

function DeckVisual({ seg }: { seg: DeckSegment }) {
  const rotation: [number, number, number] = [0, 0, seg.pitch];
  return (
    <group position={[seg.centerX, seg.centerY, 0]} rotation={rotation}>
      <mesh position={[0, -halfThickness - 0.01, 0]} castShadow>
        <boxGeometry args={[seg.length, BRIDGE_DECK_THICKNESS, BRIDGE_DECK_WIDTH]} />
        <meshStandardMaterial color={ORANGE_DARK} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[seg.length, 8]} />
        <meshStandardMaterial color={ROAD_COLOR} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[seg.length * 0.95, 0.3]} />
        <meshStandardMaterial color={LINE_COLOR} />
      </mesh>
      <mesh
        position={[0, 0.04, -roadHalfW - sidewalkW / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[seg.length, sidewalkW]} />
        <meshStandardMaterial color={SIDEWALK_COLOR} />
      </mesh>
      <mesh
        position={[0, 0.04, roadHalfW + sidewalkW / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[seg.length, sidewalkW]} />
        <meshStandardMaterial color={SIDEWALK_COLOR} />
      </mesh>
      <mesh position={[0, halfRailH, -halfDeckW + halfRailT]} castShadow>
        <boxGeometry args={[seg.length, BRIDGE_RAILING_HEIGHT, railingT]} />
        <meshStandardMaterial color={RAILING_COLOR} />
      </mesh>
      <mesh position={[0, halfRailH, halfDeckW - halfRailT]} castShadow>
        <boxGeometry args={[seg.length, BRIDGE_RAILING_HEIGHT, railingT]} />
        <meshStandardMaterial color={RAILING_COLOR} />
      </mesh>
    </group>
  );
}

// --- World-space collider data ---
//
// For each deck segment we emit three CuboidColliders: the drivable deck
// itself plus a north-side and south-side railing. Each starts in segment-
// local frame (where the deck top sits at y=0 along the segment x-axis),
// gets rotated by pitch around Z, translated by the segment center in
// bridge-local frame, then rotated by yaw around Y and translated by the
// bridge midpoint into world.
//
// Position transform: we explicitly bake the pitch and yaw rotations into
// the world position. Rotation transform: we pass Euler [0, yaw, pitch]
// (default 'XYZ' order produces matrix Ry(yaw) * Rz(pitch), the same
// composition we want).

type ColliderData = {
  position: [number, number, number];
  rotation: [number, number, number];
  halfExtents: [number, number, number];
};

function buildSegmentColliders(seg: DeckSegment): ColliderData[] {
  const halfL = seg.length / 2;
  const c = Math.cos(seg.pitch);
  const s = Math.sin(seg.pitch);

  // Apply segment-local position offset → bridge-local position.
  // Bridge-local pos = (centerX, centerY, 0) + Rz(pitch) * (lx, ly, lz).
  const segLocalToBridge = (lx: number, ly: number, lz: number) => ({
    x: seg.centerX + (c * lx - s * ly),
    y: seg.centerY + (s * lx + c * ly),
    z: lz,
  });

  // Drivable deck: in segment-local, the collider center is at
  // (0, -halfThickness, 0) so its top face sits at segment-local y=0.
  const deck = segLocalToBridge(0, -halfThickness, 0);
  // North/south railings: segment-local center at (0, halfRailH, ±(halfDeckW - halfRailT)).
  const nRail = segLocalToBridge(0, halfRailH, -halfDeckW + halfRailT);
  const sRail = segLocalToBridge(0, halfRailH, halfDeckW - halfRailT);

  const rotEuler: [number, number, number] = [0, BRIDGE_YAW, seg.pitch];

  return [
    {
      position: bridgeToWorld(deck.x, deck.y, deck.z),
      rotation: rotEuler,
      halfExtents: [halfL, halfThickness, halfDeckW],
    },
    {
      position: bridgeToWorld(nRail.x, nRail.y, nRail.z),
      rotation: rotEuler,
      halfExtents: [halfL, halfRailH, halfRailT],
    },
    {
      position: bridgeToWorld(sRail.x, sRail.y, sRail.z),
      rotation: rotEuler,
      halfExtents: [halfL, halfRailH, halfRailT],
    },
  ];
}

function buildTowerColliders(tower: TowerData): ColliderData[] {
  // Two legs straddling the deck. Axis-aligned in bridge-local frame, so
  // rotation = [0, BRIDGE_YAW, 0].
  const rotEuler: [number, number, number] = [0, BRIDGE_YAW, 0];
  return [-TOWER_LEG_CENTER_Z, TOWER_LEG_CENTER_Z].map((zz) => ({
    position: bridgeToWorld(tower.centerX, TOWER_LEG_CENTER_Y, zz),
    rotation: rotEuler,
    halfExtents: [TOWER_LEG_HALF_W, TOWER_LEG_HEIGHT / 2, TOWER_LEG_HALF_D],
  }));
}

const ALL_COLLIDERS: ColliderData[] = [
  ...DECK_SEGMENTS_DATA.flatMap(buildSegmentColliders),
  ...TOWERS.flatMap(buildTowerColliders),
];

// --- Single root-level RigidBody for all bridge collision ---

function BridgeColliders() {
  return (
    <RigidBody type="fixed" colliders={false}>
      {ALL_COLLIDERS.map((c, i) => (
        <CuboidCollider
          key={`bc_${i}`}
          args={c.halfExtents}
          position={c.position}
          rotation={c.rotation}
        />
      ))}
    </RigidBody>
  );
}

export default function Bridge() {
  return (
    <>
      <BridgeColliders />
      <group position={[BRIDGE_MID_X, 0, BRIDGE_MID_Z]} rotation={[0, BRIDGE_YAW, 0]}>
        {DECK_SEGMENTS_DATA.map((seg, i) => (
          <DeckVisual key={`deck_${i}`} seg={seg} />
        ))}
        {TOWERS.map((t, i) => (
          <TowerVisual key={`tower_${i}`} centerX={t.centerX} deckY={t.deckY} />
        ))}
        <MainCable side="north" />
        <MainCable side="south" />
        {SUSPENDERS.map((s, i) => (
          <mesh
            key={`susp_${i}`}
            position={[s.x, (s.topY + s.deckY) / 2, halfDeckW * s.side]}
            castShadow
          >
            <cylinderGeometry args={[SUSPENDER_RADIUS, SUSPENDER_RADIUS, s.topY - s.deckY, 6]} />
            <meshStandardMaterial color={CABLE_COLOR} />
          </mesh>
        ))}
      </group>
    </>
  );
}
