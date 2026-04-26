import { useMemo } from 'react';
import * as THREE from 'three';
import { ROAD_WIDTH } from './cityLayout';
import {
  sampleSplineRange,
  trimForAnchor,
  type Junction,
  type SplineRoad,
  type SplineSample,
  type Suburb,
} from './suburbs';
import { SPLINE_REGIONS } from './splineRegions';

const ASPHALT_COLOR = '#2d2d33';
const LINE_COLOR = '#d8c46a';
const EDGE_COLOR = '#f2f2f2';
const CURB_COLOR = '#444';
const LINE_WIDTH = 0.3;
const EDGE_LINE_WIDTH = 0.15;
const CURB_THICKNESS = 0.2;
const CURB_HEIGHT = 0.2;
const SURFACE_Y = 0.011;
const PAINT_Y = 0.022;
const JUNCTION_Y = 0.012;
const SAMPLES_PER_SPLINE = 56;

type SplineVisual = {
  spline: SplineRoad;
  surface: SplineSample[];
  paint: SplineSample[];
};

// Builds a flat ribbon (two rows of verts perpendicular to each tangent) at a
// fixed perpendicular offset from the sampled centerline. `perpOffset` lets
// one sampled path serve the centerline, edge stripes, and curb bases.
function buildRibbon(
  samples: SplineSample[],
  width: number,
  perpOffset: number,
  y: number,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  for (let i = 0; i < samples.length; i++) {
    const { pos, tangent } = samples[i];
    const tx = tangent[0];
    const tz = tangent[2];
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    const cx = pos[0] + nx * perpOffset;
    const cz = pos[2] + nz * perpOffset;
    positions.push(cx - nx * half, y, cz - nz * half);
    positions.push(cx + nx * half, y, cz + nz * half);
    if (i > 0) {
      const a = 2 * (i - 1);
      indices.push(a, a + 1, a + 2);
      indices.push(a + 1, a + 3, a + 2);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// 3D curb strip: four vertices per sample (bottom outer, bottom inner, top
// inner, top outer) stitched into a short wall. Same idea as a curved box.
function buildCurbStrip(
  samples: SplineSample[],
  perpOffset: number,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const halfT = CURB_THICKNESS / 2;
  for (let i = 0; i < samples.length; i++) {
    const { pos, tangent } = samples[i];
    const tx = tangent[0];
    const tz = tangent[2];
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    const cx = pos[0] + nx * perpOffset;
    const cz = pos[2] + nz * perpOffset;
    positions.push(cx - nx * halfT, 0, cz - nz * halfT);
    positions.push(cx + nx * halfT, 0, cz + nz * halfT);
    positions.push(cx + nx * halfT, CURB_HEIGHT, cz + nz * halfT);
    positions.push(cx - nx * halfT, CURB_HEIGHT, cz - nz * halfT);
    if (i > 0) {
      const a = 4 * (i - 1);
      const b = 4 * i;
      const rings: Array<[number, number]> = [
        [0, 1],
        [2, 3],
        [1, 2],
        [3, 0],
      ];
      for (const [p, q] of rings) {
        indices.push(a + p, a + q, b + q);
        indices.push(a + p, b + q, b + p);
      }
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function SplineAsphalt({ samples, width }: { samples: SplineSample[]; width: number }) {
  const geom = useMemo(() => buildRibbon(samples, width, 0, 0), [samples, width]);
  return (
    <mesh geometry={geom} position={[0, SURFACE_Y, 0]} receiveShadow>
      <meshStandardMaterial color={ASPHALT_COLOR} />
    </mesh>
  );
}

function SplinePaint({
  samples,
  width,
  perpOffset,
  color,
}: {
  samples: SplineSample[];
  width: number;
  perpOffset: number;
  color: string;
}) {
  const geom = useMemo(
    () => buildRibbon(samples, width, perpOffset, 0),
    [samples, width, perpOffset],
  );
  return (
    <mesh geometry={geom} position={[0, PAINT_Y, 0]}>
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function SplineCurb({
  samples,
  perpOffset,
}: {
  samples: SplineSample[];
  perpOffset: number;
}) {
  const geom = useMemo(() => buildCurbStrip(samples, perpOffset), [samples, perpOffset]);
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial color={CURB_COLOR} />
    </mesh>
  );
}

function SplineRoadVisual({ visual }: { visual: SplineVisual }) {
  const { surface, paint } = visual;
  return (
    <group>
      <SplineAsphalt samples={surface} width={ROAD_WIDTH} />
      <SplinePaint samples={paint} width={LINE_WIDTH} perpOffset={0} color={LINE_COLOR} />
      <SplinePaint
        samples={paint}
        width={EDGE_LINE_WIDTH}
        perpOffset={-ROAD_WIDTH / 2 + 0.2}
        color={EDGE_COLOR}
      />
      <SplinePaint
        samples={paint}
        width={EDGE_LINE_WIDTH}
        perpOffset={ROAD_WIDTH / 2 - 0.2}
        color={EDGE_COLOR}
      />
      <SplineCurb samples={surface} perpOffset={-(ROAD_WIDTH / 2 + CURB_THICKNESS / 2)} />
      <SplineCurb samples={surface} perpOffset={ROAD_WIDTH / 2 + CURB_THICKNESS / 2} />
    </group>
  );
}

function JunctionDisc({ junction }: { junction: Junction }) {
  const [x, , z] = junction.pos;
  const isCul = junction.kind === 'culDeSac';
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, JUNCTION_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[junction.radius, 40]} />
        <meshStandardMaterial color={ASPHALT_COLOR} />
      </mesh>
      {isCul && (
        // Ring curb around the cul-de-sac bulb. A thin torus reads as a raised
        // rim at normal camera distance; collision is not wired up here.
        <mesh position={[0, CURB_HEIGHT / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry
            args={[junction.radius, CURB_THICKNESS / 2, 6, 40]}
          />
          <meshStandardMaterial color={CURB_COLOR} />
        </mesh>
      )}
    </group>
  );
}

function useSuburbVisuals(suburb: Suburb): SplineVisual[] {
  return useMemo(() => {
    return suburb.splines.map((spline) => {
      const trimStart = trimForAnchor(spline.start, suburb);
      const trimEnd = trimForAnchor(spline.end, suburb);
      // Paint trims a touch further so centerline + edge stripes don't bleed
      // into junction discs even when the curb ribbon already stopped.
      const paintPad = 0.5;
      const surface = sampleSplineRange(
        spline.controls,
        SAMPLES_PER_SPLINE,
        trimStart,
        trimEnd,
      );
      const paint = sampleSplineRange(
        spline.controls,
        SAMPLES_PER_SPLINE,
        trimStart + paintPad,
        trimEnd + paintPad,
      );
      return { spline, surface, paint };
    });
  }, [suburb]);
}

function SuburbGroup({ suburb }: { suburb: Suburb }) {
  const visuals = useSuburbVisuals(suburb);
  return (
    <group>
      {visuals.map((v) => (
        <SplineRoadVisual key={v.spline.id} visual={v} />
      ))}
      {suburb.junctions.map((j) => (
        <JunctionDisc key={j.id} junction={j} />
      ))}
    </group>
  );
}

export default function SuburbRoads() {
  return (
    <group>
      {SPLINE_REGIONS.map((s) => (
        <SuburbGroup key={s.id} suburb={s} />
      ))}
    </group>
  );
}
