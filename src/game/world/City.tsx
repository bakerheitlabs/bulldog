import Buildings from './Buildings';
import GroundAndProps from './GroundAndProps';
import Roads from './Roads';
import Sidewalks from './Sidewalks';
import SuburbRoads from './SuburbRoads';
import TrafficLights from './TrafficLights';

export default function City() {
  return (
    <group>
      <GroundAndProps />
      <Roads />
      <SuburbRoads />
      <Sidewalks />
      <Buildings />
      <TrafficLights />
    </group>
  );
}
