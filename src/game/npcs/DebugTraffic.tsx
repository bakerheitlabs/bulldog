import DrivenCar from './DrivenCar';
import { useDebugTrafficStore } from './debugTrafficState';

// Renders any AI cars spawned via the dev console (`traffic spawn N`).
// Each one is a plain DrivenCar with `debug=true` so its path/stuck logs
// land in the browser console and you can watch it untangle waypoints.
export default function DebugTraffic({ paused }: { paused: boolean }) {
  const cars = useDebugTrafficStore((s) => s.cars);
  return (
    <>
      {cars.map((c) => (
        <DrivenCar
          key={c.key}
          seed={c.key * 1009 + 7}
          paused={paused}
          startId={c.startId}
          debug
          idOverride={`debug_car_${c.key}`}
        />
      ))}
    </>
  );
}
