import { useEffect, useMemo, useRef } from 'react';
import { readDrivenPlaneYaw } from '@/game/vehicles/vehicleState';
import { tokens } from '@/ui/tokens';

const BAND_WIDTH = 380;
const BAND_HEIGHT = 44;
const PX_PER_DEG = 4; // ~95° visible across the band
const TICK_STEP_DEG = 5;
const LABEL_STEP_DEG = 30;

type Tick = {
  angle: number;
  major: boolean; // 30° tick → drawn taller
  cardinal?: 'N' | 'E' | 'S' | 'W';
  label?: string; // numeric label for non-cardinal majors
};

function buildTicks(): Tick[] {
  const out: Tick[] = [];
  for (let a = 0; a < 360; a += TICK_STEP_DEG) {
    const major = a % LABEL_STEP_DEG === 0;
    const t: Tick = { angle: a, major };
    if (major) {
      if (a === 0) t.cardinal = 'N';
      else if (a === 90) t.cardinal = 'E';
      else if (a === 180) t.cardinal = 'S';
      else if (a === 270) t.cardinal = 'W';
      else t.label = a.toString().padStart(3, '0');
    }
    out.push(t);
  }
  return out;
}

// Plane physics stores yaw with yaw=0 → forward +Z. The world map renders
// +Z downward, so visually +Z is south and -Z is north — i.e. plane yaw=0
// reads as 180° on the compass. Flip and offset accordingly so the heading
// matches the direction the player sees the plane flying on the minimap.
function yawToHeadingDeg(yaw: number): number {
  let deg = 180 - (yaw * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

export default function CompassBand() {
  const ticks = useMemo(buildTicks, []);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const heading = yawToHeadingDeg(readDrivenPlaneYaw());
      const strip = stripRef.current;
      if (strip) {
        strip.style.transform = `translateX(${-heading * PX_PER_DEG}px)`;
      }
      const label = headingRef.current;
      if (label) {
        label.textContent = `${Math.round(heading).toString().padStart(3, '0')}°`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Render ticks at -360 / 0 / +360 so the band wraps seamlessly through North.
  const repeats = [-360, 0, 360];

  return (
    <div
      style={{
        position: 'relative',
        width: BAND_WIDTH,
        height: BAND_HEIGHT + 20,
        pointerEvents: 'none',
      }}
    >
      {/* band container */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: BAND_HEIGHT,
          background: tokens.color.panel,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.sm,
          boxShadow: tokens.shadow.panel,
          overflow: 'hidden',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        {/* edge fade to soften ticks running off the sides */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(12,14,18,0.95) 0%, rgba(12,14,18,0) 12%, rgba(12,14,18,0) 88%, rgba(12,14,18,0.95) 100%)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        {/* scrolling strip — origin pre-shifted to band center */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: BAND_WIDTH / 2,
            height: '100%',
            width: 0,
          }}
        >
          <div
            ref={stripRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: 0,
              willChange: 'transform',
            }}
          >
            {repeats.map((offset) =>
              ticks.map((t) => {
                const x = (t.angle + offset) * PX_PER_DEG;
                const isCardinal = t.cardinal != null;
                const tickH = t.major ? (isCardinal ? 18 : 14) : 6;
                const tickW = isCardinal ? 2 : 1;
                const tickColor = isCardinal
                  ? tokens.color.accent
                  : t.major
                    ? 'rgba(255,255,255,0.85)'
                    : 'rgba(255,255,255,0.45)';
                return (
                  <div
                    key={`${offset}-${t.angle}`}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: 0,
                      transform: 'translateX(-50%)',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: tickW,
                        height: tickH,
                        background: tickColor,
                        borderRadius: 1,
                      }}
                    />
                    {(isCardinal || t.label) && (
                      <span
                        style={{
                          marginTop: 2,
                          fontFamily: tokens.font.mono,
                          fontSize: isCardinal ? 16 : 10,
                          fontWeight: isCardinal ? 800 : 500,
                          letterSpacing: 0.5,
                          lineHeight: 1,
                          color: isCardinal
                            ? tokens.color.accent
                            : tokens.color.text,
                        }}
                      >
                        {t.cardinal ?? t.label}
                      </span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
        {/* center indicator: vertical line from top to bottom of band */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 2,
            height: '100%',
            background: tokens.color.accent,
            opacity: 0.55,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* center pointer above the band */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `7px solid ${tokens.color.accent}`,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
        }}
      />
      {/* numeric heading readout below band */}
      <div
        style={{
          position: 'absolute',
          top: BAND_HEIGHT + 4,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: tokens.font.mono,
          fontSize: 12,
          fontWeight: 700,
          color: tokens.color.accent,
          letterSpacing: 1,
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
        }}
      >
        <span ref={headingRef}>000°</span>
      </div>
    </div>
  );
}
