import AirportRegion from './AirportRegion';
import Bridge from './Bridge';
import BridgeApproach from './BridgeApproach';
import Buildings from './Buildings';
import DistantBuildings from './DistantBuildings';
import DistantRoads from './DistantRoads';
import Dock from './Dock';
import GroundAndProps from './GroundAndProps';
import Island from './Island';
import Island2Village from './Island2Village';
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
      <Bridge />
      <BridgeApproach />
      <AirportRegion paused={paused} />
      <Island2Village />
      <Dock />
    </group>
  );
}
