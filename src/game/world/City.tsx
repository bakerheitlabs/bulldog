import AirportRegion from './AirportRegion';
import Buildings from './Buildings';
import DistantBuildings from './DistantBuildings';
import DistantRoads from './DistantRoads';
import GroundAndProps from './GroundAndProps';
import Island from './Island';
import Roads from './Roads';
import Sidewalks from './Sidewalks';
import SuburbRoads from './SuburbRoads';
import TrafficLights from './TrafficLights';

export default function City({ paused }: { paused: boolean }) {
  return (
    <group>
      <Island />
      <GroundAndProps />
      <Roads />
      <SuburbRoads />
      <Sidewalks />
      <Buildings />
      <DistantBuildings />
      <DistantRoads />
      <TrafficLights />
      <AirportRegion paused={paused} />
    </group>
  );
}
