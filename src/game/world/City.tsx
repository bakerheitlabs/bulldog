import Buildings from './Buildings';
import GroundAndProps from './GroundAndProps';
import Roads from './Roads';
import Sidewalks from './Sidewalks';

export default function City() {
  return (
    <group>
      <GroundAndProps />
      <Roads />
      <Sidewalks />
      <Buildings />
    </group>
  );
}
