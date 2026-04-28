// Aggregates lane and pedestrian waypoint graphs from every drivable region.
// All registered city grids contribute their lane + ped maps (main island,
// island 3, ...). Island 2's straight-streets "city district" contributes a
// small clockwise loop on top. AI drivers and pedestrian wanderers read merged
// maps from here so adding more regions later is one extra spread.

import {
  getAllCityGrids,
  type LaneWaypoint,
  type Waypoint,
} from './cityLayout';
import './island3'; // side-effect: registers ISLAND3_CITY before we read getAllCityGrids
import {
  ISLAND2_LANE_WAYPOINTS,
  ISLAND2_PED_WAYPOINTS,
} from './island2';
import { BRIDGE_LANE_WAYPOINTS, wireBridgeLanes } from './bridgeData';

const cityLane: Record<string, LaneWaypoint> = {};
const cityPed: Record<string, Waypoint> = {};
for (const g of getAllCityGrids()) {
  Object.assign(cityLane, g.laneWaypoints);
  Object.assign(cityPed, g.pedWaypoints);
}

export const LANE_WAYPOINTS: Record<string, LaneWaypoint> = {
  ...cityLane,
  ...ISLAND2_LANE_WAYPOINTS,
  ...BRIDGE_LANE_WAYPOINTS,
};

// Stitch bridge endpoints into the merged graph so cars can route across.
wireBridgeLanes(LANE_WAYPOINTS);

export const PED_WAYPOINTS: Record<string, Waypoint> = {
  ...cityPed,
  ...ISLAND2_PED_WAYPOINTS,
};
