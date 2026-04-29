// Reserved-land marker for the future SE police district. The buildings
// and access road have been scrapped — only the pad's footprint remains so
// the main island's perimeter still wraps this corner of the SE shoreline
// (which the dock-area bay carve in landBounds.ts is calibrated against).
//
// When the district is ever rebuilt, restore the SUBURB + spec exports
// that lived here previously (see git history).

// Pad: 160m wide × 120m deep, centered SE of the city.
const PAD_CENTER_X = 700;
const PAD_CENTER_Z = 600;
const PAD_HALF_W = 80;
const PAD_HALF_D = 60;

// AABB of the reserved police district pad with a small margin. Used by
// landBounds.ts to extend the main island so the area sits on solid
// ground rather than over water.
export function getMainPoliceDistrictPadBounds(): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const m = 30;
  return {
    minX: PAD_CENTER_X - PAD_HALF_W - m,
    maxX: PAD_CENTER_X + PAD_HALF_W + m,
    minZ: PAD_CENTER_Z - PAD_HALF_D - m,
    maxZ: PAD_CENTER_Z + PAD_HALF_D + m,
  };
}
