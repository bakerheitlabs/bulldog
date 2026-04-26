import { useEffect, useRef } from 'react';
import { useGameStore } from '@/state/gameStore';
import { startRain, type RainHandle } from '@/game/audio/synth';

// Drives the procedural rain bus from the weather state. Rain stays running
// while the weather is wet (rain or storm); we just retune `setIntensity`
// across changes so we never tear down and rebuild the noise sources for a
// quick rain↔storm flip.
export default function WeatherAudio() {
  const weather = useGameStore((s) => s.weather.type);
  const handleRef = useRef<RainHandle | null>(null);

  useEffect(() => {
    const wet = weather === 'rain' || weather === 'storm';
    const intensity = weather === 'storm' ? 0.95 : weather === 'rain' ? 0.6 : 0;
    if (wet) {
      if (!handleRef.current) handleRef.current = startRain(intensity);
      else handleRef.current.setIntensity(intensity);
    } else if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
    }
  }, [weather]);

  // Always tear the loop down when the component itself unmounts (e.g.
  // navigating away from the game route) so the audio graph doesn't leak.
  useEffect(() => {
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, []);

  return null;
}
