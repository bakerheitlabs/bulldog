import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import { WEATHER_TYPES, type WeaponId, type WeatherType } from '@/save/schema';
import { nearestLaneWaypoints, yawForLaneDir } from '@/game/world/cityLayout';
import {
  TELEPORT_DESTINATIONS,
  isTeleportDestination,
  requestTeleport,
  resolveDestination,
} from '@/game/world/teleport';
import { useDebugTrafficStore } from '@/game/npcs/debugTrafficState';
import { useSpawnedVehiclesStore } from '@/game/vehicles/spawnedVehiclesState';
import {
  VEHICLE_IDENTITY,
  type VehicleIdentityKey,
} from '@/game/vehicles/vehicleIdentity';
import { tokens } from '@/ui/tokens';

type Line = { kind: 'cmd' | 'ok' | 'err'; text: string };

const HELP = [
  'health N[%]         set player health (0–100)',
  'ammo <weapon> N     set reserve ammo (weapons: handgun, shotgun, smg)',
  'godmode             toggle unlimited health + ammo',
  'wanted 0-5          set wanted stars',
  'time HH:MM          set world clock (24-hour)',
  'weather <type> [h]  sunny | cloudy | rain | storm; optional duration in hours',
  'traffic spawn [N]   spawn N debug AI cars near you (default 1, max 8)',
  'traffic clear       remove all debug AI cars',
  'spawn <name>        spawn a drivable car next to you (e.g. floord_enforcer)',
  'spawn list          list available vehicle names',
  'spawn clear         remove all dev-spawned vehicles',
  `teleport <dest>     teleport to: ${TELEPORT_DESTINATIONS.join(' | ')}`,
  'help                show this list',
  'clear               clear console output',
];

function isWeatherType(s: string): s is WeatherType {
  return (WEATHER_TYPES as readonly string[]).includes(s);
}

function parseClock(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 3600 + min * 60;
}

function isWeaponId(s: string): s is WeaponId {
  return s in WEAPONS;
}

// Normalize a user-supplied vehicle name for fuzzy matching: lowercase and
// strip everything but a-z0-9 so "Floord Enforcer", "floord_enforcer", and
// "floord-enforcer" all collapse to "floordenforcer".
function normalizeVehicleName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Match against variant key, brand+model, and the model alone — whichever
// the user types. Returns null if nothing matches.
function resolveVehicleName(name: string): VehicleIdentityKey | null {
  const target = normalizeVehicleName(name);
  if (!target) return null;
  for (const key of Object.keys(VEHICLE_IDENTITY) as VehicleIdentityKey[]) {
    if (normalizeVehicleName(key) === target) return key;
    const id = VEHICLE_IDENTITY[key];
    if (normalizeVehicleName(`${id.brand}${id.model}`) === target) return key;
    if (normalizeVehicleName(id.model) === target) return key;
  }
  return null;
}

function listVehicleNames(): string[] {
  return (Object.keys(VEHICLE_IDENTITY) as VehicleIdentityKey[]).map((key) => {
    const id = VEHICLE_IDENTITY[key];
    return `${id.brand.toLowerCase()}_${id.model.toLowerCase()}`;
  });
}

function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace('%', '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function runCommand(raw: string): Line[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const [cmd, ...args] = trimmed.split(/\s+/);
  const state = useGameStore.getState();
  switch (cmd.toLowerCase()) {
    case 'help':
      return HELP.map((text) => ({ kind: 'ok', text }));
    case 'health': {
      const n = parseNumber(args[0]);
      if (n == null) return [{ kind: 'err', text: 'usage: health N[%]' }];
      state.setHealth(n);
      return [{ kind: 'ok', text: `health → ${useGameStore.getState().player.health}` }];
    }
    case 'ammo': {
      const w = args[0];
      const n = parseNumber(args[1]);
      if (!w || n == null) return [{ kind: 'err', text: 'usage: ammo <weapon> N' }];
      if (!isWeaponId(w)) {
        return [
          {
            kind: 'err',
            text: `unknown weapon "${w}" — try: ${Object.keys(WEAPONS).join(', ')}`,
          },
        ];
      }
      state.setAmmoReserve(w, n);
      return [{ kind: 'ok', text: `${w} reserve → ${n}` }];
    }
    case 'godmode': {
      const next = !state.godMode;
      state.setGodMode(next);
      return [{ kind: 'ok', text: `godmode ${next ? 'ON' : 'OFF'}` }];
    }
    case 'wanted': {
      const n = parseNumber(args[0]);
      if (n == null) return [{ kind: 'err', text: 'usage: wanted 0-5' }];
      state.setWantedStars(n);
      return [{ kind: 'ok', text: `wanted → ${Math.max(0, Math.min(5, Math.round(n)))} ★` }];
    }
    case 'time': {
      const sec = parseClock(args[0]);
      if (sec == null) return [{ kind: 'err', text: 'usage: time HH:MM (24-hour)' }];
      state.setWorldTimeSeconds(sec);
      const hh = Math.floor(sec / 3600).toString().padStart(2, '0');
      const mm = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
      return [{ kind: 'ok', text: `time → ${hh}:${mm}` }];
    }
    case 'weather': {
      const w = args[0]?.toLowerCase();
      if (!w || !isWeatherType(w)) {
        return [
          {
            kind: 'err',
            text: `usage: weather <${WEATHER_TYPES.join('|')}> [hours]`,
          },
        ];
      }
      // Duration is optional. Without it we still want a "real" spell rather
      // than a one-frame blip, so default to 2h (middle of the short bucket).
      let hours = 2;
      if (args[1] != null) {
        const n = parseNumber(args[1]);
        if (n == null || n <= 0) {
          return [{ kind: 'err', text: 'usage: weather <type> [hours] — hours must be > 0' }];
        }
        hours = n;
      }
      state.overrideWeather(w, hours * 3600);
      return [
        {
          kind: 'ok',
          text: `weather → ${w} for ${hours}h`,
        },
      ];
    }
    case 'traffic': {
      const sub = args[0]?.toLowerCase();
      const traffic = useDebugTrafficStore.getState();
      if (sub === 'clear') {
        traffic.clear();
        return [{ kind: 'ok', text: 'cleared debug AI cars' }];
      }
      if (sub === 'spawn') {
        const n = Math.max(1, Math.min(8, Math.round(parseNumber(args[1]) ?? 1)));
        const player = state.player.position;
        // Skip waypoints within 6 m so the new car isn't on top of the player.
        const wps = nearestLaneWaypoints(
          { x: player[0], z: player[2] },
          n,
          6,
        );
        if (wps.length === 0) {
          return [{ kind: 'err', text: 'no nearby lane waypoints found' }];
        }
        for (const wp of wps) traffic.spawn(wp.id);
        return [
          {
            kind: 'ok',
            text: `spawned ${wps.length} debug car(s) at: ${wps.map((w) => w.id).join(', ')}`,
          },
          {
            kind: 'ok',
            text: 'open browser console to see [ai:debug_car_*] path logs',
          },
        ];
      }
      return [{ kind: 'err', text: 'usage: traffic spawn [N] | traffic clear' }];
    }
    case 'spawn': {
      const sub = args[0]?.toLowerCase();
      const spawned = useSpawnedVehiclesStore.getState();
      if (sub === 'clear') {
        spawned.clear();
        return [{ kind: 'ok', text: 'cleared dev-spawned vehicles' }];
      }
      if (sub === 'list' || !sub) {
        if (!sub) {
          return [
            { kind: 'err', text: 'usage: spawn <name> | spawn list | spawn clear' },
            { kind: 'ok', text: `available: ${listVehicleNames().join(', ')}` },
          ];
        }
        return [{ kind: 'ok', text: `available: ${listVehicleNames().join(', ')}` }];
      }
      const variant = resolveVehicleName(sub);
      if (!variant) {
        return [
          { kind: 'err', text: `unknown vehicle "${sub}" — try "spawn list"` },
        ];
      }
      const player = state.player.position;
      // Use the nearest lane waypoint so the car spawns on a road and is
      // already aligned with the lane direction. Skip waypoints within 6 m
      // so it doesn't appear on top of the player.
      const wps = nearestLaneWaypoints(
        { x: player[0], z: player[2] },
        1,
        6,
      );
      if (wps.length === 0) {
        return [{ kind: 'err', text: 'no nearby lane waypoint to spawn on' }];
      }
      const wp = wps[0];
      spawned.spawn(
        variant,
        [wp.pos[0], 0, wp.pos[2]],
        yawForLaneDir(wp.dir),
      );
      const id = VEHICLE_IDENTITY[variant];
      return [
        {
          kind: 'ok',
          text: `spawned ${id.brand} ${id.model} at ${wp.id} (${wp.pos[0].toFixed(0)}, ${wp.pos[2].toFixed(0)})`,
        },
      ];
    }
    case 'tp':
    case 'teleport': {
      const dest = args[0]?.toLowerCase();
      if (!dest || !isTeleportDestination(dest)) {
        return [
          {
            kind: 'err',
            text: `usage: teleport <${TELEPORT_DESTINATIONS.join('|')}>`,
          },
        ];
      }
      const pos = resolveDestination(dest);
      if (!pos) {
        return [{ kind: 'err', text: `couldn't resolve "${dest}" — landmark missing from grid?` }];
      }
      requestTeleport(pos);
      return [
        {
          kind: 'ok',
          text: `teleporting to ${dest} (${pos[0].toFixed(0)}, ${pos[2].toFixed(0)})`,
        },
      ];
    }
    case 'clear':
      return [];
    default:
      return [{ kind: 'err', text: `unknown command: ${cmd} (try "help")` }];
  }
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  left: 14,
  right: 14,
  bottom: 14,
  background: tokens.color.panelStrong,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  boxShadow: tokens.shadow.panel,
  fontFamily: tokens.font.mono,
  fontSize: 13,
  color: tokens.color.text,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '40vh',
  pointerEvents: 'auto',
};

const historyStyle: CSSProperties = {
  padding: '10px 12px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderTop: `1px solid ${tokens.color.border}`,
};

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: tokens.color.text,
  fontFamily: tokens.font.mono,
  fontSize: 13,
};

export default function DevConsole({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([
    { kind: 'ok', text: 'dev console — type "help" for commands' },
  ]);
  const [value, setValue] = useState('');
  const historyIdx = useRef<number | null>(null);
  const pastCmds = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      // Defer so the keydown that opened us doesn't land in the input.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    setValue('');
    historyIdx.current = null;
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, open]);

  if (!open) return null;

  const submit = () => {
    const raw = value;
    const cmdLine: Line = { kind: 'cmd', text: `> ${raw}` };
    const result = runCommand(raw);
    if (raw.trim().toLowerCase() === 'clear') {
      setLines([]);
    } else {
      setLines((prev) => [...prev, cmdLine, ...result]);
    }
    if (raw.trim()) pastCmds.current.push(raw);
    historyIdx.current = null;
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.code === 'Escape' || e.code === 'Backquote') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      if (pastCmds.current.length === 0) return;
      const nextIdx =
        historyIdx.current == null
          ? pastCmds.current.length - 1
          : Math.max(0, historyIdx.current - 1);
      historyIdx.current = nextIdx;
      setValue(pastCmds.current[nextIdx] ?? '');
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx.current == null) return;
      const nextIdx = historyIdx.current + 1;
      if (nextIdx >= pastCmds.current.length) {
        historyIdx.current = null;
        setValue('');
      } else {
        historyIdx.current = nextIdx;
        setValue(pastCmds.current[nextIdx] ?? '');
      }
    }
  };

  return (
    <div style={panelStyle}>
      <div ref={scrollRef} style={historyStyle}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color:
                line.kind === 'err'
                  ? tokens.color.hpLow
                  : line.kind === 'cmd'
                    ? tokens.color.accent
                    : tokens.color.text,
              whiteSpace: 'pre-wrap',
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
      <div style={inputRowStyle}>
        <span style={{ color: tokens.color.accent }}>&gt;</span>
        <input
          ref={inputRef}
          style={inputStyle}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          placeholder='type "help"'
        />
      </div>
    </div>
  );
}
