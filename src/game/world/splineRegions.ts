// Aggregator for off-grid road regions and the AIRPORTS list. Both kinds of
// region use the Suburb shape (junctions + handoffs + splines) so a single
// renderer (SuburbRoads.tsx) and a single minimap layer can iterate them.
//
// Lives in its own module to avoid suburbs <-> airport <-> island2 import
// cycles. Other consumers (AirportRegion, CityMap, teleport) read AIRPORTS
// from here.

import { SUBURBS, type Suburb } from './suburbs';
import {
  MAIN_AIRPORT,
  MAIN_AIRPORT_SUBURB,
  type AirportSpec,
} from './airport';
import { ISLAND2_AIRPORT, ISLAND2_ROADS_SUBURB } from './island2';
import { BRIDGE_APPROACH_SUBURB } from './bridgeApproachData';

// All airports in the world. Order matters: index 0 is the main airport,
// which hosts the scheduled airliner.
export const AIRPORTS: AirportSpec[] = [MAIN_AIRPORT, ISLAND2_AIRPORT];

// All spline-driven road regions: the city's east suburb, the main airport's
// access highway, the bridge approach to island 3, and island 2's road
// network. SuburbRoads.tsx maps over this list and renders each region the
// same way.
export const SPLINE_REGIONS: Suburb[] = [
  ...SUBURBS,
  MAIN_AIRPORT_SUBURB,
  BRIDGE_APPROACH_SUBURB,
  ISLAND2_ROADS_SUBURB,
];

export type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function suburbBounds(s: Suburb): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const include = (x: number, z: number, pad: number) => {
    if (x - pad < minX) minX = x - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (z - pad < minZ) minZ = z - pad;
    if (z + pad > maxZ) maxZ = z + pad;
  };
  for (const j of s.junctions) include(j.pos[0], j.pos[2], j.radius);
  for (const sp of s.splines) {
    for (const c of sp.controls) include(c[0], c[2], sp.width / 2);
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return { minX, maxX, minZ, maxZ };
}

function airportPadBounds(spec: AirportSpec, margin = 30): Bounds {
  return {
    minX: spec.pad.minX - margin,
    maxX: spec.pad.maxX + margin,
    minZ: spec.pad.minZ - margin,
    maxZ: spec.pad.maxZ + margin,
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

// Bounding rect over all spline regions and all airport pads. Used by the
// minimap to size its viewport and by landBounds when an island has no
// distinct city footprint to anchor on.
export function getSplineRegionBounds(): Bounds {
  let bounds: Bounds | null = null;
  for (const region of SPLINE_REGIONS) {
    const b = suburbBounds(region);
    bounds = bounds ? unionBounds(bounds, b) : b;
  }
  for (const apt of AIRPORTS) {
    const b = airportPadBounds(apt);
    bounds = bounds ? unionBounds(bounds, b) : b;
  }
  return bounds ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
}
