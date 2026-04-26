// Aggregates lane and pedestrian waypoint graphs from every drivable region.
// The city grid in cityLayout.ts builds the bulk; island 2's straight-streets
// "city district" contributes a small clockwise loop. AI drivers and
// pedestrian wanderers read merged maps from here so adding more regions
// later is a one-line change.

import {
  LANE_WAYPOINTS as CITY_LANE_WAYPOINTS,
  PED_WAYPOINTS as CITY_PED_WAYPOINTS,
  type LaneWaypoint,
  type Waypoint,
} from './cityLayout';
import {
  ISLAND2_LANE_WAYPOINTS,
  ISLAND2_PED_WAYPOINTS,
} from './island2';

export const LANE_WAYPOINTS: Record<string, LaneWaypoint> = {
  ...CITY_LANE_WAYPOINTS,
  ...ISLAND2_LANE_WAYPOINTS,
};

export const PED_WAYPOINTS: Record<string, Waypoint> = {
  ...CITY_PED_WAYPOINTS,
  ...ISLAND2_PED_WAYPOINTS,
};
