import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import type { WeaponId } from '@/save/schema';
import { tokens } from '@/ui/tokens';

type Line = { kind: 'cmd' | 'ok' | 'err'; text: string };

const HELP = [
  'health N[%]         set player health (0–100)',
  'ammo <weapon> N     set reserve ammo (weapons: handgun, shotgun, smg)',
  'godmode             toggle unlimited health + ammo',
  'wanted 0-5          set wanted stars',
  'help                show this list',
  'clear               clear console output',
];

function isWeaponId(s: string): s is WeaponId {
  return s in WEAPONS;
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
