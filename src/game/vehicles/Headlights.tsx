import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Source positions match where the Kenney colormap paints headlights onto the
// 4 m-long car body: ~45% out from center, low on the front face, tucked
// right at the front bumper. Tuned so the spotlight cone visually emanates
// from the painted headlight on the model rather than a point in front of it.
const SOURCE_OFFSET_X = 0.48;
const SOURCE_OFFSET_Y = 0.24;
const SOURCE_OFFSET_Z = 1.82;

// Aim the beam ~8 m ahead and below floor level so the cone tilts down onto
// the road instead of running parallel to the horizon.
const TARGET_FORWARD_Z = 8;
const TARGET_Y = -1.6;

const BEAM_COLOR = '#fff5d6';
const BEAM_INTENSITY = 22;
const BEAM_DISTANCE = 16;
const BEAM_ANGLE = 0.4;
const BEAM_PENUMBRA = 0.55;
const BEAM_DECAY = 1.6;

function Beam({ side }: { side: -1 | 1 }) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  // SpotLight points from its world position toward `target`'s world position.
  // Both nodes live in the same RigidBody-attached group, so the body's pose
  // transforms them together and the beam direction stays car-relative.
  useEffect(() => {
    const l = lightRef.current;
    const t = targetRef.current;
    if (!l || !t) return;
    l.target = t;
  }, []);

  const x = side * SOURCE_OFFSET_X;
  return (
    <>
      <object3D ref={targetRef} position={[x, TARGET_Y, SOURCE_OFFSET_Z + TARGET_FORWARD_Z]} />
      <spotLight
        ref={lightRef}
        position={[x, SOURCE_OFFSET_Y, SOURCE_OFFSET_Z]}
        color={BEAM_COLOR}
        intensity={BEAM_INTENSITY}
        distance={BEAM_DISTANCE}
        angle={BEAM_ANGLE}
        penumbra={BEAM_PENUMBRA}
        decay={BEAM_DECAY}
        castShadow={false}
      />
    </>
  );
}

// Pair of forward-facing spotlights anchored to the painted headlight
// positions on the GLB body. Three's forward renderer pays per-light cost
// across every shaded fragment, so this is gated to the `castBeams` car
// (driven car) — every additional pair would tax the whole scene.
export default function Headlights({
  enabled,
  castBeams,
}: {
  enabled: boolean;
  castBeams: boolean;
}) {
  if (!enabled || !castBeams) return null;
  return (
    <>
      <Beam side={-1} />
      <Beam side={1} />
    </>
  );
}
