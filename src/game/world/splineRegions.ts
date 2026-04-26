// Aggregator for off-grid road regions (suburbs + airport access). Both kinds
// of region use the Suburb shape (junctions + handoffs + splines) so a single
// renderer (SuburbRoads.tsx) and a single minimap layer can iterate them.
//
// Lives in its own module to avoid a suburbs <-> airport import cycle.

import { SUBURBS, getSuburbBounds, type Suburb } from './suburbs';
import { AIRPORT_SUBURB, getAirportBounds } from './airport';

export const SPLINE_REGIONS: Suburb[] = [...SUBURBS, AIRPORT_SUBURB];

export type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function getSplineRegionBounds(): Bounds {
  const a = getSuburbBounds();
  const b = getAirportBounds();
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}
