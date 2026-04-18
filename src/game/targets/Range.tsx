import { getTargetSpawns } from '@/game/world/cityLayout';
import TargetDummy from './TargetDummy';

export default function Range() {
  const spawns = getTargetSpawns();
  return (
    <group>
      {spawns.map((s) => (
        <TargetDummy key={s.id} id={s.id} position={s.pos} />
      ))}
    </group>
  );
}
