import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import {
  allCells,
  cellBounds,
  CITY_DEPTH,
  CITY_MIN_X,
  CITY_MIN_Z,
  CITY_WIDTH,
  SIDEWALK_WIDTH,
} from '@/game/world/cityLayout';
import { useGameStore } from '@/state/gameStore';
import {
  readDrivenCarPos,
  readDrivenCarYaw,
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

const CELLS = allCells();
const CITY_HEIGHT = CITY_DEPTH;
const MAP_PADDING = 10;
const MINIMAP_VIEW_MIN = 150;
const MINIMAP_VIEW_MAX = 310;
const FULL_VIEW_SIZE = Math.max(CITY_WIDTH, CITY_HEIGHT) + MAP_PADDING * 2;
const PAUSE_MIN_VIEW_SIZE = 90;
const PLAYER_COLOR = '#f5cb5c';

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
  return {
    size,
    x: clamp(view.x, -MAP_PADDING, CITY_WIDTH + MAP_PADDING - size),
    y: clamp(view.y, -MAP_PADDING, CITY_HEIGHT + MAP_PADDING - size),
  };
}

function headingDegrees(yaw: number, driven: boolean) {
  if (!driven) return (-yaw * 180) / Math.PI;
  return (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI;
}

function useMapPose() {
  const player = useGameStore((s) => s.player);
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const [drivenPose, setDrivenPose] = useState<{ x: number; z: number; yaw: number } | null>(null);
  const [speedMps, setSpeedMps] = useState(0);
  const lastSample = useRef<{ x: number; z: number; t: number } | null>(null);

  useEffect(() => {
    if (!drivenCarId) {
      setDrivenPose(null);
      return;
    }

    let raf = 0;
    const tick = () => {
      const pos = readDrivenCarPos();
      if (pos) setDrivenPose({ x: pos.x, z: pos.z, yaw: readDrivenCarYaw() });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [drivenCarId]);

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

function MapCells({ showLabels }: { showLabels: boolean }) {
  return (
    <>
      {CELLS.map(({ col, row, cell }) => {
        if (cell.kind === 'road' && cell.mergedInto) return null;
        if (cell.kind === 'building' && cell.mergedInto) return null;
        const rawBounds =
          cell.kind === 'building' && cell.mergedBounds
            ? cell.mergedBounds
            : cellBounds(col, row);
        const x = rawBounds.minX - CITY_MIN_X;
        const y = rawBounds.minZ - CITY_MIN_Z;
        const w = rawBounds.maxX - rawBounds.minX;
        const h = rawBounds.maxZ - rawBounds.minZ;
        const fill = cellFill(cell.kind, cell.kind === 'building' ? cell.tag : undefined);

        if (cell.kind === 'building') {
          return (
            <g key={`${col}_${row}`}>
              <rect x={x} y={y} width={w} height={h} fill="#73777d" />
              <rect
                x={x + SIDEWALK_WIDTH}
                y={y + SIDEWALK_WIDTH}
                width={w - SIDEWALK_WIDTH * 2}
                height={h - SIDEWALK_WIDTH * 2}
                fill={fill}
              />
              {showLabels && cell.tag && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 5}
                  textAnchor="middle"
                  fontSize={18}
                  fontWeight={700}
                  fill="#f5f1de"
                >
                  {cell.tag === 'gunstore' ? 'G' : 'R'}
                </text>
              )}
            </g>
          );
        }

        return (
          <g key={`${col}_${row}`}>
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
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const minimapViewSize = clamp(
    MINIMAP_VIEW_MIN + pose.speedMps * (pose.driven ? 8 : 6),
    MINIMAP_VIEW_MIN,
    MINIMAP_VIEW_MAX,
  );

  const viewBox = useMemo(() => {
    if (!isMinimap) {
      return `${pauseView.x} ${pauseView.y} ${pauseView.size} ${pauseView.size}`;
    }
    const x = clamp(player.x - minimapViewSize / 2, 0, CITY_WIDTH - minimapViewSize);
    const y = clamp(player.y - minimapViewSize / 2, 0, CITY_HEIGHT - minimapViewSize);
    return `${x} ${y} ${minimapViewSize} ${minimapViewSize}`;
  }, [isMinimap, minimapViewSize, pauseView, player.x, player.y]);

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (isMinimap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startView: pauseView,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (isMinimap || !drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mapPerPixel = drag.startView.size / Math.max(1, rect.width);
    setPauseView(
      boundedView({
        ...drag.startView,
        x: drag.startView.x - (e.clientX - drag.startClientX) * mapPerPixel,
        y: drag.startView.y - (e.clientY - drag.startClientY) * mapPerPixel,
      }),
    );
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const handleWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (isMinimap) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const pointerY = (e.clientY - rect.top) / Math.max(1, rect.height);
    const pixelDelta =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * rect.height : e.deltaY;
    const zoomFactor = Math.exp(clamp(pixelDelta, -100, 100) * 0.002);

    setPauseView((prev) => {
      const focusX = prev.x + pointerX * prev.size;
      const focusY = prev.y + pointerY * prev.size;
      const nextSize = clamp(prev.size * zoomFactor, PAUSE_MIN_VIEW_SIZE, FULL_VIEW_SIZE);
      const ratio = nextSize / prev.size;
      return boundedView({
        size: nextSize,
        x: focusX - (focusX - prev.x) * ratio,
        y: focusY - (focusY - prev.y) * ratio,
      });
    });
  };

  const wrapStyle: CSSProperties = isMinimap
    ? {
        width: 154,
        height: 154,
        background: 'rgba(7,8,10,0.72)',
        border: '1px solid rgba(255,255,255,0.34)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }
    : {
        width: '100%',
        aspectRatio: '1 / 1',
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
        viewBox={viewBox}
        width="100%"
        height="100%"
        role="img"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{ display: 'block', cursor: isMinimap ? 'default' : isDragging ? 'grabbing' : 'grab' }}
      >
        <rect
          x={-MAP_PADDING}
          y={-MAP_PADDING}
          width={CITY_WIDTH + MAP_PADDING * 2}
          height={CITY_HEIGHT + MAP_PADDING * 2}
          fill="#293b2d"
        />
        <MapCells showLabels={!isMinimap} />
        <g
          transform={`translate(${player.x} ${player.y}) rotate(${pose.heading}) scale(${markerScale})`}
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
