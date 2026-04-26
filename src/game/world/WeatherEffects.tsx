import { useGameStore } from '@/state/gameStore';
import Rain from './Rain';
import Lightning from './Lightning';
import WeatherAudio from './WeatherAudio';

// Bundles the weather-driven scene effects (rain particles + storm lightning
// + audio). Lighting/sky/fog modulation lives in DayNightLighting; this
// component is just the additive effects layer so it can be toggled
// independently if needed.
export default function WeatherEffects() {
  const weather = useGameStore((s) => s.weather.type);
  const isWet = weather === 'rain' || weather === 'storm';
  const isStorm = weather === 'storm';
  return (
    <>
      <Rain active={isWet} />
      <Lightning active={isStorm} />
      <WeatherAudio />
    </>
  );
}
