// Design tokens for the in-game HUD and overlays. Keep this as a plain object
// of string/number constants — no runtime, no context — so every HUD component
// can pick values out by key without incurring re-renders or React context.

export const tokens = {
  color: {
    panel: 'rgba(12,14,18,0.62)',
    panelSolid: '#101217',
    panelStrong: 'rgba(8,10,14,0.82)',
    border: 'rgba(255,255,255,0.14)',
    borderStrong: 'rgba(255,255,255,0.28)',
    text: '#f2f4f7',
    textMuted: 'rgba(242,244,247,0.6)',
    textGhost: 'rgba(242,244,247,0.35)',
    accent: '#f5cb5c',
    accentDim: 'rgba(245,203,92,0.35)',
    hpHigh: '#6fb96f',
    hpMid: '#d8b34a',
    hpLow: '#d94d3a',
    danger: '#e0523d',
    shadow: 'rgba(0,0,0,0.45)',
  },
  font: {
    display: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
  radius: {
    sm: 4,
    md: 6,
    lg: 10,
  },
  shadow: {
    panel: '0 10px 30px rgba(0,0,0,0.45)',
    glow: '0 0 14px rgba(245,203,92,0.5)',
  },
  motion: {
    easeOut: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    fast: 140,
    med: 220,
    slow: 360,
  },
} as const;

export type Tokens = typeof tokens;
