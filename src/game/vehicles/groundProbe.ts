// Per-frame ground probe for kinematic cars. Cars are KinematicPositionBased
// rigid bodies — they don't get collision response from Rapier, so we have to
// look up the surface beneath them ourselves and feed the resulting Y into
// `setNextKinematicTranslation`. A downward raycast against fixed colliders
// (island ground, bridge deck, dock, etc.) gives us a generic "ride on
// whatever fixed geometry is below" mechanic — no per-feature wiring needed
// for future ramps, overpasses, or hills.
//
// Origin trick: cast from `(x, refY + LIFT, z)` where LIFT is small (~2m,
// just above the car's roof). A low origin can NEVER hit a building roof
// from below — the ray points down, and roofs are far above origin — so the
// car can't accidentally snap onto a 12m apartment roof when driving past.
// At the same time the bridge approaches grade gradually (parabolic), so as
// the car rolls onto the deck the deck top is barely above origin and the
// ray catches it. As `refY` rises with the deck, origin keeps clearing the
// surface above. This is the conventional "low-origin downward cast" pattern
// from kinematic-vehicle systems.
//
// Filter: EXCLUDE_DYNAMIC | EXCLUDE_KINEMATIC | EXCLUDE_SENSORS plus
// `filterExcludeRigidBody = self`. That leaves only FIXED geometry, which is
// exactly the world surface set we want. AI cars and the driven player car
// are both kinematic; without EXCLUDE_KINEMATIC the probe would hit the car
// in front of us.
//
// Off-world fallback: if the cast misses (drove off the bridge mid-arc into
// open water), the helper returns grade-Y so the caller still has a smooth
// lerp target. Better than freezing in midair.

import { useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useCallback, useMemo } from 'react';
import * as THREE from 'three';

const LIFT = 2;
const MAX_TOI = 60;
const GRADE_HALF_FALLBACK = 0.45;

export type GroundProbeResult = {
  targetY: number;
  normal: THREE.Vector3;
  hit: boolean;
};

export type GroundProbe = (
  x: number,
  z: number,
  refY: number,
  halfH: number,
  self: RapierRigidBody,
  out?: GroundProbeResult,
) => GroundProbeResult;

export function makeGroundProbeResult(): GroundProbeResult {
  return { targetY: GRADE_HALF_FALLBACK, normal: new THREE.Vector3(0, 1, 0), hit: false };
}

export function useGroundProbe(): GroundProbe {
  const { world, rapier } = useRapier();
  // Reusable scratch — ~30 calls per frame; avoid GC pressure.
  const origin = useMemo(() => new rapier.Vector3(0, 0, 0), [rapier]);
  const dir = useMemo(() => new rapier.Vector3(0, -1, 0), [rapier]);
  const filterFlags = useMemo(
    () =>
      rapier.QueryFilterFlags.EXCLUDE_DYNAMIC |
      rapier.QueryFilterFlags.EXCLUDE_KINEMATIC |
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    [rapier],
  );

  return useCallback(
    (x, z, refY, halfH, self, out) => {
      const result = out ?? makeGroundProbeResult();
      origin.x = x;
      origin.y = refY + LIFT;
      origin.z = z;
      const ray = new rapier.Ray(origin, dir);
      const hit = world.castRayAndGetNormal(
        ray,
        MAX_TOI,
        true, // solid
        filterFlags,
        undefined, // filterGroups
        undefined, // filterExcludeCollider
        self, // filterExcludeRigidBody
      );
      if (hit) {
        const groundY = origin.y - hit.timeOfImpact;
        result.targetY = groundY + halfH;
        result.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        result.hit = true;
      } else {
        result.targetY = halfH;
        result.normal.set(0, 1, 0);
        result.hit = false;
      }
      return result;
    },
    [world, rapier, origin, dir, filterFlags],
  );
}

// Convert a ground normal into a pitch angle along a heading direction.
// Returns radians: positive = nose up.
//
// Math: project the normal onto the (forward, up) plane and take atan2.
// For flat ground (normal=(0,1,0)), pitch = 0.
// For a deck rising in the +forward direction, the surface tangent slopes up,
// so the normal tilts back (against forward); the resulting `along` is
// negative, and pitch comes out positive (nose up).
export function pitchAlongHeading(normal: THREE.Vector3, yaw: number): number {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const along = normal.x * fx + normal.z * fz;
  return Math.atan2(-along, Math.max(0.001, normal.y));
}
