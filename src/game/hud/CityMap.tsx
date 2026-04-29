import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  CITY_MIN_X,
  CITY_MIN_Z,
  SIDEWALK_WIDTH,
  getAllCityGrids,
  getCityGrid,
  type CellInfo,
} from '@/game/world/cityLayout';
import '@/game/world/island3'; // side-effect: registers ISLAND3_CITY
import {
  BRIDGE_MAIN_X,
  BRIDGE_MAIN_Z,
  BRIDGE_I3_X,
  BRIDGE_I3_Z,
  BRIDGE_DECK_WIDTH,
} from '@/game/world/bridgeData';
import { sampleSpline } from '@/game/world/suburbs';
import { AIRPORTS, SPLINE_REGIONS } from '@/game/world/splineRegions';
import { getAllIslands, type PerimeterPoint } from '@/game/world/landBounds';
import { useGameStore } from '@/state/gameStore';
import {
  readDrivenCarPos,
  readDrivenCarYaw,
  readDrivenPlanePos,
  readDrivenPlaneYaw,
  useVehicleStore,
} from '@/game/vehicles/vehicleState';

type CityMapProps = {
  variant: 'minimap' | 'pause';
};

type MapView = {
  x: number;
  y: number;
  size: number;
};

const CELLS: CellInfo[] = getAllCityGrids().flatMap((g) => g.allCells());
const ISLANDS = getAllIslands();
const MAP_PADDING = 10;
// Extra water around the islands so the coast doesn't sit on the viewport edge.
const WATER_MARGIN = 80;
const MINIMAP_VIEW_MIN = 150;
const MINIMAP_VIEW_MAX = 310;
// Bound the viewport to the union of all island AABBs (in map coords). The
// islands are sized to enclose the city grid, suburbs, and airports, so this
// covers everything visible. Coords are pre-translated by CITY_MIN so map
// space stays anchored at the grid's top-left like before.
const ISLAND_BOUNDS = (() => {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const island of ISLANDS) {
    if (island.bounds.minX < minX) minX = island.bounds.minX;
    if (island.bounds.minZ < minZ) minZ = island.bounds.minZ;
    if (island.bounds.maxX > maxX) maxX = island.bounds.maxX;
    if (island.bounds.maxZ > maxZ) maxZ = island.bounds.maxZ;
  }
  return { minX, minZ, maxX, maxZ };
})();
const WORLD_MIN_X = ISLAND_BOUNDS.minX - CITY_MIN_X - WATER_MARGIN;
const WORLD_MIN_Y = ISLAND_BOUNDS.minZ - CITY_MIN_Z - WATER_MARGIN;
const WORLD_MAX_X = ISLAND_BOUNDS.maxX - CITY_MIN_X + WATER_MARGIN;
const WORLD_MAX_Y = ISLAND_BOUNDS.maxZ - CITY_MIN_Z + WATER_MARGIN;
const WORLD_WIDTH = WORLD_MAX_X - WORLD_MIN_X;
const WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y;
// Pause view is non-square so a tall world (island 2 sits well north of the
// main island) fills the viewport instead of forcing the user to zoom out
// past empty water on the sides. `MapView.size` is the viewBox *height* in
// map units; width follows the world's aspect ratio. Picking height is
// arbitrary — the math is symmetric and pan/zoom scale both axes uniformly.
const FULL_VIEW_W = WORLD_WIDTH + MAP_PADDING * 2;
const FULL_VIEW_H = WORLD_HEIGHT + MAP_PADDING * 2;
const VIEW_ASPECT_W_OVER_H = FULL_VIEW_W / FULL_VIEW_H;
const FULL_VIEW_SIZE = FULL_VIEW_H;
const PAUSE_MIN_VIEW_SIZE = 90;
const vbWidth = (size: number) => size * VIEW_ASPECT_W_OVER_H;
const PLAYER_COLOR = '#f5cb5c';
const WATER_COLOR = '#2a4a6e';
const BEACH_COLOR = '#d9c89a';
const GRASS_COLOR = '#3a4a39';
const SUBURB_ROAD_COLOR = '#2c2f35';
const SUBURB_ROAD_WIDTH_PX = 6;
const SUBURB_SAMPLES = 40;

// --- Pan/zoom feel tuning (pause view only) ---
// Drag inertia: velocity decays exponentially after release with this e-fold
// time. Lower = snappier stop, higher = more glide.
const ANIM_VEL_TAU_MS = 220;
// Smooth zoom: render size lerps toward target size with this e-fold time.
// Each wheel event nudges the *target*, so consecutive events never feel
// jittery — they just push the goalpost.
const ANIM_ZOOM_TAU_MS = 75;
// Stop the anim loop once both signals are this small.
const ANIM_VEL_EPS = 0.003; // map units per ms
const ANIM_ZOOM_EPS = 0.3; // map units of remaining size delta
// Velocity is computed from samples within this trailing window so a long
// slow drag that ends still doesn't fling.
const VELOCITY_WINDOW_MS = 90;
const VELOCITY_SAMPLE_CAP = 8;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// World coords are centered on the origin; the map's origin is its top-left.
function toMapPos(x: number, z: number) {
  return {
    x: x - CITY_MIN_X,
    y: z - CITY_MIN_Z,
  };
}

function boundedView(view: MapView): MapView {
  const size = clamp(view.size, PAUSE_MIN_VIEW_SIZE, FULL_VIEW_SIZE);
  const w = vbWidth(size);
  return {
    size,
    x: clamp(view.x, WORLD_MIN_X - MAP_PADDING, WORLD_MAX_X + MAP_PADDING - w),
    y: clamp(view.y, WORLD_MIN_Y - MAP_PADDING, WORLD_MAX_Y + MAP_PADDING - size),
  };
}

function headingDegrees(yaw: number, driven: boolean) {
  if (!driven) return (-yaw * 180) / Math.PI;
  return (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI;
}

function useMapPose() {
  const player = useGameStore((s) => s.player);
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const [drivenPose, setDrivenPose] = useState<{ x: number; z: number; yaw: number } | null>(null);
  const [speedMps, setSpeedMps] = useState(0);
  const lastSample = useRef<{ x: number; z: number; t: number } | null>(null);

  useEffect(() => {
    if (!drivenCarId && !drivenPlaneId) {
      setDrivenPose(null);
      return;
    }

    let raf = 0;
    const tick = () => {
      // Plane and car share the same map convention (yaw=0 → forward +Z),
      // so they go through the same `driven` heading formula below; we just
      // pull pose from whichever pose-mirror is active.
      if (drivenPlaneId) {
        const pos = readDrivenPlanePos();
        if (pos) setDrivenPose({ x: pos.x, z: pos.z, yaw: readDrivenPlaneYaw() });
      } else {
        const pos = readDrivenCarPos();
        if (pos) setDrivenPose({ x: pos.x, z: pos.z, yaw: readDrivenCarYaw() });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [drivenCarId, drivenPlaneId]);

  const pose = drivenPose
    ? {
        x: drivenPose.x,
        z: drivenPose.z,
        heading: headingDegrees(drivenPose.yaw, true),
        driven: true,
      }
    : {
        x: player.position[0],
        z: player.position[2],
        heading: headingDegrees(player.rotationY, false),
        driven: false,
      };

  useEffect(() => {
    const now = performance.now();
    const last = lastSample.current;
    if (!last) {
      lastSample.current = { x: pose.x, z: pose.z, t: now };
      return;
    }

    const dt = Math.max(1, now - last.t) / 1000;
    const nextSpeed = Math.hypot(pose.x - last.x, pose.z - last.z) / dt;
    lastSample.current = { x: pose.x, z: pose.z, t: now };
    setSpeedMps((prev) => prev * 0.75 + nextSpeed * 0.25);
  }, [pose.x, pose.z]);

  return { ...pose, speedMps };
}

function cellFill(kind: string, tag?: string) {
  if (tag === 'gunstore') return '#8a3630';
  if (tag === 'range') return '#69524b';
  if (tag === 'hospital') return '#d5d9dd';
  if (tag === 'church') return '#c8b58a';
  if (tag === 'stadium') return '#7a7d83';
  if (tag === 'marina') return '#cdb98a';
  if (tag === 'hotel') return '#d4af56';
  switch (kind) {
    case 'road':
      return '#2c2f35';
    case 'park':
      return '#3d6f45';
    case 'parkingLot':
      return '#555861';
    default:
      return '#5a5e64';
  }
}

function RoadMarkings({
  x,
  y,
  w,
  h,
  carriesNS,
  carriesEW,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  carriesNS: boolean;
  carriesEW: boolean;
}) {
  return (
    <>
      {carriesNS && (
        <line
          x1={x + w / 2}
          y1={y + 5}
          x2={x + w / 2}
          y2={y + h - 5}
          stroke="#d8c46a"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
      )}
      {carriesEW && (
        <line
          x1={x + 5}
          y1={y + h / 2}
          x2={x + w - 5}
          y2={y + h / 2}
          stroke="#d8c46a"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
      )}
    </>
  );
}

function polygonPoints(points: PerimeterPoint[]): string {
  let out = '';
  for (let i = 0; i < points.length; i++) {
    const p = toMapPos(points[i].x, points[i].z);
    out += `${p.x},${p.y} `;
  }
  return out;
}

// Beach + grass silhouette for every island. Drawn first (over the water rect)
// so all later layers — cells, roads, airports — sit on top of land.
function IslandLayer() {
  return (
    <>
      {ISLANDS.map((island) => (
        <g key={island.id}>
          <polygon points={polygonPoints(island.outerPolygon)} fill={BEACH_COLOR} />
          <polygon points={polygonPoints(island.innerPolygon)} fill={GRASS_COLOR} />
        </g>
      ))}
    </>
  );
}

// Dock on the main island's north shore (facing island 2). Single brown
// stripe on the minimap representing the pier deck.
// E-shaped pier on the main island's north shore: spine at z=400 with
// three 80m fingers at x ∈ {-30, 0, +30} extending north into open water.
function DockLayer() {
  const SHORE_Z = 400;
  const FINGER_LEN = 80;
  const FINGER_W = 6;
  const SPINE_W = 6;
  const SPINE_HALF_LEN = 33;
  const FINGER_X = [-30, 0, 30];
  const COLOR = '#8a6a3a';
  const spine = toMapPos(-SPINE_HALF_LEN, SHORE_Z);
  return (
    <g>
      <rect
        x={spine.x}
        y={spine.y}
        width={SPINE_HALF_LEN * 2}
        height={SPINE_W}
        fill={COLOR}
      />
      {FINGER_X.map((fx) => {
        const p = toMapPos(fx - FINGER_W / 2, SHORE_Z);
        return (
          <rect
            key={`finger_${fx}`}
            x={p.x}
            y={p.y}
            width={FINGER_W}
            height={FINGER_LEN}
            fill={COLOR}
          />
        );
      })}
    </g>
  );
}

function SuburbLayer() {
  const content = useMemo(() => {
    return SPLINE_REGIONS.flatMap((s) => {
      const splinePaths = s.splines.map((spline) => {
        const pts = sampleSpline(spline.controls, SUBURB_SAMPLES)
          .map((sample) => {
            const p = toMapPos(sample.pos[0], sample.pos[2]);
            return `${p.x},${p.y}`;
          })
          .join(' ');
        return (
          <polyline
            key={`spline_${s.id}_${spline.id}`}
            points={pts}
            fill="none"
            stroke={SUBURB_ROAD_COLOR}
            strokeWidth={SUBURB_ROAD_WIDTH_PX}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });
      const junctionDiscs = s.junctions.map((j) => {
        const p = toMapPos(j.pos[0], j.pos[2]);
        return (
          <circle
            key={`junction_${s.id}_${j.id}`}
            cx={p.x}
            cy={p.y}
            r={j.radius}
            fill={SUBURB_ROAD_COLOR}
          />
        );
      });
      return [...splinePaths, ...junctionDiscs];
    });
  }, []);
  return <>{content}</>;
}

function AirportLayer({ showLabels }: { showLabels: boolean }) {
  const content = useMemo(() => {
    const out: React.ReactNode[] = [];
    const rect = (
      key: string,
      cx: number,
      cz: number,
      w: number,
      d: number,
      fill: string,
    ) => {
      const p = toMapPos(cx - w / 2, cz - d / 2);
      out.push(<rect key={key} x={p.x} y={p.y} width={w} height={d} fill={fill} />);
    };
    AIRPORTS.forEach((apt, idx) => {
      const k = (s: string) => `${apt.id}_${s}`;
      // Pad first (under everything else)
      {
        const cx = (apt.pad.minX + apt.pad.maxX) / 2;
        const cz = (apt.pad.minZ + apt.pad.maxZ) / 2;
        const w = apt.pad.maxX - apt.pad.minX;
        const d = apt.pad.maxZ - apt.pad.minZ;
        rect(k('pad'), cx, cz, w, d, '#3f4147');
      }
      rect(
        k('apron'),
        apt.apron.centerX,
        apt.apron.centerZ,
        apt.apron.width,
        apt.apron.depth,
        '#4a4d54',
      );
      rect(
        k('taxi'),
        apt.taxiway.centerX,
        apt.taxiway.centerZ,
        apt.taxiway.width,
        apt.taxiway.depth,
        '#26282d',
      );
      rect(
        k('runway'),
        apt.runway.centerX,
        apt.runway.centerZ,
        apt.runway.width,
        apt.runway.depth,
        '#1f2126',
      );
      // Runway centerline along the long axis.
      {
        if (apt.axis === 'z') {
          const p = toMapPos(apt.runway.centerX, apt.runway.centerZ - apt.runway.depth / 2);
          out.push(
            <line
              key={k('runway_cl')}
              x1={p.x}
              y1={p.y + 4}
              x2={p.x}
              y2={p.y + apt.runway.depth - 4}
              stroke="#d8c46a"
              strokeWidth={1}
              strokeDasharray="4 4"
            />,
          );
        } else {
          const p = toMapPos(apt.runway.centerX - apt.runway.width / 2, apt.runway.centerZ);
          out.push(
            <line
              key={k('runway_cl')}
              x1={p.x + 4}
              y1={p.y}
              x2={p.x + apt.runway.width - 4}
              y2={p.y}
              stroke="#d8c46a"
              strokeWidth={1}
              strokeDasharray="4 4"
            />,
          );
        }
      }
      rect(
        k('lot'),
        apt.parkingLot.centerX,
        apt.parkingLot.centerZ,
        apt.parkingLot.width,
        apt.parkingLot.depth,
        '#555861',
      );
      rect(
        k('terminal'),
        apt.terminal.centerX,
        apt.terminal.centerZ,
        apt.terminal.width,
        apt.terminal.depth,
        '#cfd2d6',
      );
      rect(
        k('tower'),
        apt.tower.centerX,
        apt.tower.centerZ,
        apt.tower.width,
        apt.tower.depth,
        '#bfc1c5',
      );
      apt.hangars.forEach((h, i) => {
        rect(k(`hangar_${i}`), h.centerX, h.centerZ, h.width, h.depth, '#7c8089');
      });
      if (showLabels) {
        const tp = toMapPos(apt.terminal.centerX, apt.terminal.centerZ);
        out.push(
          <text
            key={k('label')}
            x={tp.x}
            y={tp.y + 5}
            textAnchor="middle"
            fontSize={16}
            fontWeight={700}
            fill="#1d2530"
          >
            {idx === 0 ? 'A' : `A${idx + 1}`}
          </text>,
        );
      }
    });
    return out;
  }, [showLabels]);
  return <>{content}</>;
}

function MapCells({ showLabels }: { showLabels: boolean }) {
  return (
    <>
      {CELLS.map(({ gridId, col, row, cell }) => {
        if (cell.kind === 'road' && cell.mergedInto) return null;
        if (cell.kind === 'building' && cell.mergedInto) return null;
        const grid = getCityGrid(gridId);
        if (!grid) return null;
        const rawBounds =
          cell.kind === 'building' && cell.mergedBounds
            ? cell.mergedBounds
            : grid.cellBounds(col, row);
        const x = rawBounds.minX - CITY_MIN_X;
        const y = rawBounds.minZ - CITY_MIN_Z;
        const w = rawBounds.maxX - rawBounds.minX;
        const h = rawBounds.maxZ - rawBounds.minZ;
        const fill = cellFill(cell.kind, cell.kind === 'building' ? cell.tag : undefined);
        const key = `${gridId}_${col}_${row}`;

        if (cell.kind === 'building') {
          return (
            <g key={key}>
              <rect x={x} y={y} width={w} height={h} fill="#73777d" />
              <rect
                x={x + SIDEWALK_WIDTH}
                y={y + SIDEWALK_WIDTH}
                width={w - SIDEWALK_WIDTH * 2}
                height={h - SIDEWALK_WIDTH * 2}
                fill={fill}
              />
              {showLabels && cell.tag && cell.tag !== 'mechanic' && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 5}
                  textAnchor="middle"
                  fontSize={18}
                  fontWeight={700}
                  fill={cell.tag === 'hospital' ? '#c03a38' : '#f5f1de'}
                >
                  {cell.tag === 'gunstore'
                    ? 'G'
                    : cell.tag === 'hospital'
                      ? 'H'
                      : cell.tag === 'church'
                        ? 'C'
                        : cell.tag === 'stadium'
                          ? 'S'
                          : cell.tag === 'marina'
                            ? 'M'
                            : cell.tag === 'hotel'
                              ? 'HTL'
                              : 'R'}
                </text>
              )}
            </g>
          );
        }

        return (
          <g key={key}>
            <rect x={x} y={y} width={w} height={h} fill={fill} />
            {cell.kind === 'road' && (
              <RoadMarkings
                x={x}
                y={y}
                w={w}
                h={h}
                carriesNS={cell.carriesNS}
                carriesEW={cell.carriesEW}
              />
            )}
            {showLabels && cell.kind === 'park' && (
              <circle cx={x + w / 2} cy={y + h / 2} r={8} fill="#86b77a" />
            )}
            {showLabels && cell.kind === 'parkingLot' && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 5}
                textAnchor="middle"
                fontSize={16}
                fontWeight={700}
                fill="#d9dce2"
              >
                P
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// Bridge stripe between main island and island 3.
function BridgeLayer() {
  const a = toMapPos(BRIDGE_MAIN_X, BRIDGE_MAIN_Z);
  const b = toMapPos(BRIDGE_I3_X, BRIDGE_I3_Z);
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke="#2c2f35"
      strokeWidth={Math.max(4, BRIDGE_DECK_WIDTH * 0.5)}
      strokeLinecap="square"
    />
  );
}

export default function CityMap({ variant }: CityMapProps) {
  const pose = useMapPose();
  const player = toMapPos(pose.x, pose.z);
  const isMinimap = variant === 'minimap';
  const [pauseView, setPauseView] = useState<MapView>(() =>
    boundedView({ x: -MAP_PADDING, y: -MAP_PADDING, size: FULL_VIEW_SIZE }),
  );
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startView: MapView;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Mirror of pauseView so the rAF loop reads/writes synchronously without
  // racing setState. Always written alongside setPauseView.
  const viewRef = useRef<MapView>(pauseView);
  // Velocity samples in client px during a drag — converted to map-space
  // velocity at release time using the drag's mapPerPixel.
  const sampleRef = useRef<{ x: number; y: number; t: number }[]>([]);
  // Animation state: pan velocity (map units / ms) and a zoom target with the
  // map-space focus point that should stay anchored under the cursor.
  const animRef = useRef<{
    raf: number | null;
    lastT: number;
    vx: number;
    vy: number;
    zoomTargetSize: number | null;
    zoomFocusX: number;
    zoomFocusY: number;
  }>({
    raf: null,
    lastT: 0,
    vx: 0,
    vy: 0,
    zoomTargetSize: null,
    zoomFocusX: 0,
    zoomFocusY: 0,
  });

  // One rAF loop per active anim. Reads/writes refs synchronously and only
  // calls setPauseView when the view actually changes; stops itself when both
  // pan velocity and zoom-toward-target have settled.
  const kickAnim = useCallback(() => {
    const a = animRef.current;
    if (a.raf != null) return;
    a.lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - a.lastT);
      a.lastT = now;
      let next = viewRef.current;
      let changed = false;

      // Pan inertia: integrate velocity, decay it, kill on wall contact.
      const hasVel = Math.abs(a.vx) > ANIM_VEL_EPS || Math.abs(a.vy) > ANIM_VEL_EPS;
      if (hasVel) {
        const reqX = next.x + a.vx * dt;
        const reqY = next.y + a.vy * dt;
        next = boundedView({ ...next, x: reqX, y: reqY });
        if (Math.abs(next.x - reqX) > 0.01) a.vx = 0;
        if (Math.abs(next.y - reqY) > 0.01) a.vy = 0;
        const decay = Math.exp(-dt / ANIM_VEL_TAU_MS);
        a.vx *= decay;
        a.vy *= decay;
        changed = true;
      } else {
        a.vx = 0;
        a.vy = 0;
      }

      // Zoom: lerp size toward target, recompute x/y so the focus map-point
      // stays put under the cursor.
      if (a.zoomTargetSize != null) {
        const remaining = a.zoomTargetSize - next.size;
        if (Math.abs(remaining) <= ANIM_ZOOM_EPS) {
          const ratio = a.zoomTargetSize / next.size;
          next = boundedView({
            size: a.zoomTargetSize,
            x: a.zoomFocusX - (a.zoomFocusX - next.x) * ratio,
            y: a.zoomFocusY - (a.zoomFocusY - next.y) * ratio,
          });
          a.zoomTargetSize = null;
        } else {
          const alpha = 1 - Math.exp(-dt / ANIM_ZOOM_TAU_MS);
          const newSize = next.size + remaining * alpha;
          const ratio = newSize / next.size;
          next = boundedView({
            size: newSize,
            x: a.zoomFocusX - (a.zoomFocusX - next.x) * ratio,
            y: a.zoomFocusY - (a.zoomFocusY - next.y) * ratio,
          });
        }
        changed = true;
      }

      if (changed) {
        viewRef.current = next;
        setPauseView(next);
      }

      const idle =
        Math.abs(a.vx) <= ANIM_VEL_EPS &&
        Math.abs(a.vy) <= ANIM_VEL_EPS &&
        a.zoomTargetSize == null;
      if (idle) {
        a.raf = null;
        return;
      }
      a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      const a = animRef.current;
      if (a.raf != null) {
        cancelAnimationFrame(a.raf);
        a.raf = null;
      }
    };
  }, []);

  const stopAnim = () => {
    const a = animRef.current;
    a.vx = 0;
    a.vy = 0;
    a.zoomTargetSize = null;
    if (a.raf != null) {
      cancelAnimationFrame(a.raf);
      a.raf = null;
    }
  };

  const writeView = (v: MapView) => {
    viewRef.current = v;
    setPauseView(v);
  };

  const minimapViewSize = clamp(
    MINIMAP_VIEW_MIN + pose.speedMps * (pose.driven ? 8 : 6),
    MINIMAP_VIEW_MIN,
    MINIMAP_VIEW_MAX,
  );

  const viewBox = useMemo(() => {
    if (!isMinimap) {
      return `${pauseView.x} ${pauseView.y} ${vbWidth(pauseView.size)} ${pauseView.size}`;
    }
    // GTA-style minimap: keep the player permanently at the centre of the
    // viewBox so map rotation pivots around them. No world-edge clamp — when
    // the player is near a coastline the rotated viewBox simply exposes the
    // water-coloured panel background, which reads as ocean.
    const x = player.x - minimapViewSize / 2;
    const y = player.y - minimapViewSize / 2;
    return `${x} ${y} ${minimapViewSize} ${minimapViewSize}`;
  }, [isMinimap, minimapViewSize, pauseView, player.x, player.y]);

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (isMinimap) return;
    // A new grab kills any in-flight inertia or zoom — feels like grabbing
    // a moving sheet of paper.
    stopAnim();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startView: viewRef.current,
      rectWidth: Math.max(1, rect.width),
      rectHeight: Math.max(1, rect.height),
    };
    sampleRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    setIsDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (isMinimap || !drag) return;
    const mapPerPixelX = vbWidth(drag.startView.size) / drag.rectWidth;
    const mapPerPixelY = drag.startView.size / drag.rectHeight;
    writeView(
      boundedView({
        ...drag.startView,
        x: drag.startView.x - (e.clientX - drag.startClientX) * mapPerPixelX,
        y: drag.startView.y - (e.clientY - drag.startClientY) * mapPerPixelY,
      }),
    );
    const samples = sampleRef.current;
    samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (samples.length > VELOCITY_SAMPLE_CAP) samples.shift();
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      // Compute release velocity from samples within the trailing window so
      // a long drag that ended slowly doesn't fling.
      const now = performance.now();
      const recent = sampleRef.current.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = Math.max(1, last.t - first.t);
        const mapPerPixelX = vbWidth(drag.startView.size) / drag.rectWidth;
        const mapPerPixelY = drag.startView.size / drag.rectHeight;
        // Map moves opposite the cursor (the world stays put as the viewport
        // shifts), so negate the delta to get viewport velocity.
        animRef.current.vx = (-(last.x - first.x) / dt) * mapPerPixelX;
        animRef.current.vy = (-(last.y - first.y) / dt) * mapPerPixelY;
        kickAnim();
      }
      dragRef.current = null;
      sampleRef.current = [];
      setIsDragging(false);
    }
  };

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Wheel + Safari gesture events must be attached as native non-passive
  // listeners. React's onWheel is passive by default, which makes
  // preventDefault() a silent no-op — and on macOS a trackpad pinch then
  // bubbles up as a browser page-zoom. Same story for Safari's gesturestart
  // family. We attach manually so preventDefault actually blocks the default.
  useEffect(() => {
    if (isMinimap) return;
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const pointerX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const pointerY = (e.clientY - rect.top) / Math.max(1, rect.height);
      const pixelDelta =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * rect.height
            : e.deltaY;
      // Trackpad pinch on Chromium delivers wheel events with ctrlKey=true;
      // boost the multiplier so a pinch feels like a zoom rather than a
      // page-scale-sized scroll.
      const sensitivity = e.ctrlKey ? 0.012 : 0.002;
      const zoomFactor = Math.exp(clamp(pixelDelta, -100, 100) * sensitivity);

      const a = animRef.current;
      const currentSize = viewRef.current.size;
      a.zoomFocusX = viewRef.current.x + pointerX * vbWidth(currentSize);
      a.zoomFocusY = viewRef.current.y + pointerY * currentSize;
      const baseSize = a.zoomTargetSize ?? currentSize;
      a.zoomTargetSize = clamp(baseSize * zoomFactor, PAUSE_MIN_VIEW_SIZE, FULL_VIEW_SIZE);
      kickAnim();
    };

    // Safari's pinch fires gesture events instead of ctrlKey wheel events.
    // We don't act on them yet, but we must preventDefault to stop the
    // browser's page zoom.
    const onGesture = (e: Event) => {
      e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', onGesture as EventListener, { passive: false });
    el.addEventListener('gestureend', onGesture as EventListener, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGesture as EventListener);
      el.removeEventListener('gesturechange', onGesture as EventListener);
      el.removeEventListener('gestureend', onGesture as EventListener);
    };
  }, [isMinimap, kickAnim]);

  const wrapStyle: CSSProperties = isMinimap
    ? {
        width: 158,
        height: 158,
        // Water-coloured background so any corner exposed when the rotated
        // viewBox extends past the world rect reads as ocean.
        background: WATER_COLOR,
        border: '2px solid rgba(255,255,255,0.18)',
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.4)',
      }
    : {
        // Match the world's aspect ratio so the entire map fills the panel
        // without empty water on the sides; cap the width derived from the
        // available viewport height so the map can't overflow the panel
        // vertically on shorter screens.
        width: `min(100%, calc((100vh - 220px) * ${VIEW_ASPECT_W_OVER_H}))`,
        aspectRatio: `${WORLD_WIDTH} / ${WORLD_HEIGHT}`,
        margin: '0 auto',
        background: '#0f1115',
        border: '1px solid #343840',
        borderRadius: 8,
        overflow: 'hidden',
        touchAction: 'none',
        overscrollBehavior: 'contain',
      };

  const markerScale = isMinimap ? 1.2 : 1.7;

  return (
    <div style={wrapStyle} aria-label={isMinimap ? 'Minimap' : 'City map'}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        width="100%"
        height="100%"
        role="img"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ display: 'block', cursor: isMinimap ? 'default' : isDragging ? 'grabbing' : 'grab' }}
      >
        <rect
          x={WORLD_MIN_X - MAP_PADDING}
          y={WORLD_MIN_Y - MAP_PADDING}
          width={WORLD_WIDTH + MAP_PADDING * 2}
          height={WORLD_HEIGHT + MAP_PADDING * 2}
          fill={WATER_COLOR}
        />
        {/* GTA-style minimap: rotate the world around the player so their
            facing direction is always at the top of the dial. The marker
            below is rendered outside this group with no rotation, so it
            stays fixed pointing up. The pause map skips the rotation —
            it stays north-up and the marker rotates instead. */}
        <g
          transform={
            isMinimap
              ? `rotate(${-pose.heading} ${player.x} ${player.y})`
              : undefined
          }
        >
          <IslandLayer />
          <AirportLayer showLabels={!isMinimap} />
          <MapCells showLabels={!isMinimap} />
          <SuburbLayer />
          <BridgeLayer />
          <DockLayer />
          {/* N/E/S/W cardinal labels pinned to world directions. They live
              inside the rotating group so their position tracks true world
              north/east/south/west; each label counter-rotates by
              +pose.heading around its own anchor so the glyph stays upright
              while the position rotates around the dial edge. */}
          {isMinimap &&
            (() => {
              const r = (minimapViewSize / 2) * 0.88;
              const fontSize = minimapViewSize * 0.085;
              const cardinals = [
                { letter: 'N', dx: 0, dy: -r },
                { letter: 'E', dx: r, dy: 0 },
                { letter: 'S', dx: 0, dy: r },
                { letter: 'W', dx: -r, dy: 0 },
              ];
              return cardinals.map(({ letter, dx, dy }) => {
                const lx = player.x + dx;
                const ly = player.y + dy;
                return (
                  <text
                    key={letter}
                    x={lx}
                    y={ly}
                    transform={`rotate(${pose.heading} ${lx} ${ly})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight={800}
                    fill="#f5d76e"
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth={fontSize * 0.18}
                    paintOrder="stroke"
                    fontFamily="Inter, system-ui, sans-serif"
                    style={{ pointerEvents: 'none' }}
                  >
                    {letter}
                  </text>
                );
              });
            })()}
        </g>
        <g
          transform={
            isMinimap
              ? `translate(${player.x} ${player.y}) scale(${markerScale})`
              : `translate(${player.x} ${player.y}) rotate(${pose.heading}) scale(${markerScale})`
          }
        >
          <polygon
            points="0,-8 6,7 0,4 -6,7"
            fill={PLAYER_COLOR}
            stroke="#17130a"
            strokeWidth={1.3}
          />
          <circle cx="0" cy="0" r="2.2" fill="#17130a" />
        </g>
      </svg>
    </div>
  );
}
