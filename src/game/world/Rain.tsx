import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { isPointSheltered } from './shelterRegions';

// Single LineSegments object holding ~2500 vertical "streak" drops. The whole
// volume snaps to the camera each frame so the player is always inside the
// rain box (including when flying); drops cycle locally — when a streak's top
// vertex falls below `FLOOR_Y` it pops back up to the top, preserving a
// constant population.
const DROP_COUNT = 2500;
const VOLUME_HALF_X = 28;
const VOLUME_HALF_Z = 28;
const VOLUME_TOP_Y = 18;
const VOLUME_BOTTOM_Y = -16;
const FLOOR_Y = -18;
const STREAK_LENGTH = 0.55;
const FALL_SPEED = 22;
const DROP_COLOR = '#bcc6d0';
const DROP_OPACITY = 0.55;

function buildGeometry(): THREE.BufferGeometry {
  // Two vertices per drop: top of streak and bottom of streak. LineSegments
  // pairs (0,1), (2,3), … so each drop renders as one short vertical line.
  const positions = new Float32Array(DROP_COUNT * 6);
  for (let i = 0; i < DROP_COUNT; i++) {
    const x = (Math.random() * 2 - 1) * VOLUME_HALF_X;
    const z = (Math.random() * 2 - 1) * VOLUME_HALF_Z;
    const y = VOLUME_BOTTOM_Y + Math.random() * (VOLUME_TOP_Y - VOLUME_BOTTOM_Y);
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y - STREAK_LENGTH;
    positions[i * 6 + 5] = z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geom;
}

export default function Rain({ active }: { active: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  // Geometry + material live in refs so toggling `active` doesn't realloc the
  // 30 KB position buffer on every weather flip.
  const segments = useMemo(() => {
    const geom = buildGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: DROP_COLOR,
      transparent: true,
      opacity: DROP_OPACITY,
      depthWrite: false,
    });
    return new THREE.LineSegments(geom, mat);
  }, []);

  useEffect(() => {
    return () => {
      segments.geometry.dispose();
      (segments.material as THREE.Material).dispose();
    };
  }, [segments]);

  useFrame((state, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const cam = state.camera;
    // Hide visuals when the camera is inside a registered shelter (e.g. the
    // church interior); audio continues to play because WeatherAudio drives
    // off the global weather state, not this component.
    const sheltered = isPointSheltered(cam.position.x, cam.position.y, cam.position.z);
    group.visible = active && !sheltered;
    if (!active || sheltered) return;
    // Snap the rain volume to the camera so the player is always inside it,
    // including at flight altitude.
    group.position.set(cam.position.x, cam.position.y, cam.position.z);

    const arr = segments.geometry.attributes.position.array as Float32Array;
    const dy = -FALL_SPEED * Math.min(dt, 1 / 30);
    const span = VOLUME_TOP_Y - FLOOR_Y;
    // Walk paired vertices: i is the top vert, i+3 is the bottom. We move
    // both by the same dy so the streak length stays constant; when the top
    // falls past the floor we add `span` to wrap it back to the top.
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] += dy;
      arr[i + 4] += dy;
      if (arr[i + 1] < FLOOR_Y) {
        arr[i + 1] += span;
        arr[i + 4] += span;
      }
    }
    segments.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={segments} />
    </group>
  );
}
