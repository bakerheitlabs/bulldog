// E-shaped boat dock on the main island's north shore — the side facing
// island 2 across the channel. A short east-west spine runs along the
// shoreline; three 80m finger piers branch off it heading north into open
// water, with two boats (sailboat, motorboat) moored in the bays between
// the fingers.
//
// The main island's north perimeter at x=0 sits around z ≈ +413 inner edge
// / +449 beach edge (innerRect.maxZ ≈ +383 + perimeter noise + BEACH_WIDTH).
// The spine anchors at z=+400 (on grass / beach edge depending on x), and
// each finger extends 80m north so the boats moored alongside sit clearly
// over open water.

import { CuboidCollider, RigidBody } from '@react-three/rapier';

// Geometry
const SHORE_Z = 400; // south edge of the spine
const FINGER_LEN = 80; // each finger pier's length northward into water
const FINGER_W = 6; // width of every plank deck
const SPINE_W = 6; // depth (z extent) of the spine plank
const FINGER_OFFSETS_X = [-30, 0, 30] as const; // west / middle / east finger
const SPINE_HALF_LEN = 33; // spine extends 3m past the outer fingers

const DECK_THICK = 0.3;
const DECK_Y = 0.6;
const PILE_TOP_Y = DECK_Y - DECK_THICK / 2;

// Land-side entry of the pier — the player teleports here just south of
// the bottom step, facing north toward the boats. The 3 steps are 1.5m
// total in z (3 × 0.5m treads), so SHORE_Z - 1.5 - 1 puts the player on
// grass with the steps right in front of them.
export const DOCK_ENTRY: [number, number, number] = [0, 1, SHORE_Z - 4];

const DECK_COLOR = '#8a6a3a';
const DECK_PLANK_DARK = '#7a5d33';
const PILE_COLOR = '#5a4226';
const ROPE_COLOR = '#c9a874';
const HULL_WOOD = '#7a4a22';
const HULL_WHITE = '#dcd8cf';
const HULL_BLUE = '#3a5b78';
const CABIN_WHITE = '#e6e2d6';
const SAIL_COLOR = '#f1ece0';
const MAST_COLOR = '#3a3026';

function Pile({ x, z }: { x: number; z: number }) {
  const height = 2.5;
  return (
    <mesh position={[x, PILE_TOP_Y - height / 2, z]} castShadow receiveShadow>
      <cylinderGeometry args={[0.22, 0.28, height, 8]} />
      <meshStandardMaterial color={PILE_COLOR} />
    </mesh>
  );
}

function Bollard({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, DECK_Y + 0.25, z]} castShadow>
      <cylinderGeometry args={[0.12, 0.14, 0.5, 8]} />
      <meshStandardMaterial color="#2d2620" />
    </mesh>
  );
}

function Sailboat({ x, z, headingY }: { x: number; z: number; headingY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, headingY, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 7]} />
        <meshStandardMaterial color={HULL_WHITE} />
      </mesh>
      <mesh position={[0, 0.45, 3.2]} castShadow>
        <boxGeometry args={[1.4, 0.9, 1.2]} />
        <meshStandardMaterial color={HULL_WHITE} />
      </mesh>
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[2.22, 0.12, 7.05]} />
        <meshStandardMaterial color={HULL_BLUE} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.2, 7]} />
        <meshStandardMaterial color={HULL_WOOD} />
      </mesh>
      <mesh position={[0, 1.3, -1.0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.8, 2.6]} />
        <meshStandardMaterial color={CABIN_WHITE} />
      </mesh>
      <mesh position={[0.81, 1.3, -1.0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 2.0]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      <mesh position={[-0.81, 1.3, -1.0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 2.0]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      <mesh position={[0, 4.0, 0.5]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 6.5, 8]} />
        <meshStandardMaterial color={MAST_COLOR} />
      </mesh>
      <mesh position={[0.08, 3.0, 0.5]} castShadow>
        <boxGeometry args={[0.12, 4.5, 0.18]} />
        <meshStandardMaterial color={SAIL_COLOR} />
      </mesh>
      <mesh position={[0, 1.95, -1.5]} castShadow>
        <boxGeometry args={[0.08, 0.08, 3.5]} />
        <meshStandardMaterial color={MAST_COLOR} />
      </mesh>
    </group>
  );
}

function Motorboat({ x, z, headingY }: { x: number; z: number; headingY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, headingY, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.8, 5.2]} />
        <meshStandardMaterial color={HULL_WHITE} />
      </mesh>
      <mesh position={[0, 0.4, 2.4]} castShadow>
        <boxGeometry args={[1.2, 0.8, 1]} />
        <meshStandardMaterial color={HULL_WHITE} />
      </mesh>
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[1.92, 0.1, 5.25]} />
        <meshStandardMaterial color="#a83a2c" />
      </mesh>
      <mesh position={[0, 1.0, 0.4]} castShadow>
        <boxGeometry args={[1.4, 0.5, 0.9]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      <mesh position={[0, 0.6, -2.7]} castShadow>
        <boxGeometry args={[0.4, 0.7, 0.5]} />
        <meshStandardMaterial color="#2a2c32" />
      </mesh>
      <mesh position={[0, 0.2, -2.85]} castShadow>
        <boxGeometry args={[0.2, 0.6, 0.2]} />
        <meshStandardMaterial color="#1a1a20" />
      </mesh>
    </group>
  );
}

function MooringRope({ ax, az, bx, bz }: { ax: number; az: number; bx: number; bz: number }) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return null;
  const angle = Math.atan2(dx, dz);
  return (
    <mesh
      position={[(ax + bx) / 2, DECK_Y + 0.45, (az + bz) / 2]}
      rotation={[Math.PI / 2, 0, -angle]}
    >
      <cylinderGeometry args={[0.02, 0.02, len, 5]} />
      <meshStandardMaterial color={ROPE_COLOR} />
    </mesh>
  );
}

// Three short steps leading from the beach up to the spine. The deck top
// surface sits at y = DECK_Y + DECK_THICK/2 = 0.75m above ground; three
// 0.25m risers climb to that height in front of the south edge of the
// spine. Each step is a solid box sitting on the ground so its top face is
// the tread surface and its body keeps the character controller from
// passing through the riser face.
const STEP_RISE = (DECK_Y + DECK_THICK / 2) / 3;
const STEP_TREAD = 0.5;
const STEP_WIDTH = 4;

function StairStep({ topY, cz }: { topY: number; cz: number }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[STEP_WIDTH / 2, topY / 2, STEP_TREAD / 2]}
        position={[0, topY / 2, cz]}
      />
      <mesh position={[0, topY / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[STEP_WIDTH, topY, STEP_TREAD]} />
        <meshStandardMaterial color={DECK_PLANK_DARK} />
      </mesh>
    </RigidBody>
  );
}

function DockStairs() {
  // Steps cascade south from the spine's south edge (z = SHORE_Z). Step 3
  // is flush with the deck; steps 2 and 1 are progressively further south
  // and shorter.
  const steps: Array<{ topY: number; cz: number }> = [];
  for (let i = 1; i <= 3; i++) {
    const topY = STEP_RISE * i;
    const cz = SHORE_Z - (3 - i) * STEP_TREAD - STEP_TREAD / 2;
    steps.push({ topY, cz });
  }
  return (
    <group>
      {steps.map((s, i) => (
        <StairStep key={`step_${i}`} topY={s.topY} cz={s.cz} />
      ))}
    </group>
  );
}

// Single plank-deck section with collider + centerline plank stripe.
function DeckSection({
  cx,
  cz,
  width,
  depth,
}: {
  cx: number;
  cz: number;
  width: number;
  depth: number;
}) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[width / 2, DECK_THICK / 2, depth / 2]}
        position={[cx, DECK_Y, cz]}
      />
      <mesh position={[cx, DECK_Y, cz]} castShadow receiveShadow>
        <boxGeometry args={[width, DECK_THICK, depth]} />
        <meshStandardMaterial color={DECK_COLOR} />
      </mesh>
      {/* Centerline plank seam runs along the longer axis. */}
      {depth >= width ? (
        <mesh
          position={[cx, DECK_Y + DECK_THICK / 2 + 0.001, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.15, depth]} />
          <meshStandardMaterial color={DECK_PLANK_DARK} />
        </mesh>
      ) : (
        <mesh
          position={[cx, DECK_Y + DECK_THICK / 2 + 0.001, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width, 0.15]} />
          <meshStandardMaterial color={DECK_PLANK_DARK} />
        </mesh>
      )}
    </RigidBody>
  );
}

export default function Dock() {
  const fingerCz = SHORE_Z + FINGER_LEN / 2;
  const fingerZN = SHORE_Z + FINGER_LEN;
  const spineCz = SHORE_Z + SPINE_W / 2;

  // Pilings — pairs along each finger plus a few under the spine ends.
  const piles: Array<[number, number]> = [];
  const pileZsAlongFinger = [
    SHORE_Z + 12,
    SHORE_Z + 35,
    SHORE_Z + 58,
    fingerZN - 4,
  ];
  for (const fx of FINGER_OFFSETS_X) {
    for (const z of pileZsAlongFinger) {
      piles.push([fx - FINGER_W / 2 + 0.4, z]);
      piles.push([fx + FINGER_W / 2 - 0.4, z]);
    }
  }
  // Spine end pilings.
  piles.push([-SPINE_HALF_LEN + 0.4, SHORE_Z + 0.5]);
  piles.push([SPINE_HALF_LEN - 0.4, SHORE_Z + 0.5]);

  // Each boat is tied alongside a single finger — bow line + stern line
  // both go to that finger's bollards. The middle finger is an empty slip.
  // Sailboat hugs the west finger's east edge; motorboat hugs the east
  // finger's west edge.
  const SAILBOAT_HALF_W = 1.1;
  const MOTORBOAT_HALF_W = 0.95;
  const MOOR_GAP = 0.5; // gap between hull and dock edge

  const sailboatX =
    FINGER_OFFSETS_X[0] + FINGER_W / 2 + SAILBOAT_HALF_W + MOOR_GAP;
  const sailboatZ = SHORE_Z + 50;
  const motorboatX =
    FINGER_OFFSETS_X[2] - FINGER_W / 2 - MOTORBOAT_HALF_W - MOOR_GAP;
  const motorboatZ = SHORE_Z + 45;

  // Bollards: two on the west finger's east edge (for the sailboat) and two
  // on the east finger's west edge (for the motorboat). One token bollard
  // on the middle finger so the empty slip still reads as usable.
  const sailBowBollard: [number, number] = [
    FINGER_OFFSETS_X[0] + FINGER_W / 2 - 0.6,
    sailboatZ + 2.5,
  ];
  const sailSternBollard: [number, number] = [
    FINGER_OFFSETS_X[0] + FINGER_W / 2 - 0.6,
    sailboatZ - 2.5,
  ];
  const motorBowBollard: [number, number] = [
    FINGER_OFFSETS_X[2] - FINGER_W / 2 + 0.6,
    motorboatZ + 2.0,
  ];
  const motorSternBollard: [number, number] = [
    FINGER_OFFSETS_X[2] - FINGER_W / 2 + 0.6,
    motorboatZ - 2.0,
  ];
  const middleBollard: [number, number] = [
    FINGER_OFFSETS_X[1] + FINGER_W / 2 - 0.6,
    SHORE_Z + 45,
  ];
  const bollards: Array<[number, number]> = [
    sailBowBollard,
    sailSternBollard,
    motorBowBollard,
    motorSternBollard,
    middleBollard,
  ];

  return (
    <group>
      {/* Stairs leading up to the spine from the beach. */}
      <DockStairs />

      {/* Spine — runs along the shore, connecting the three fingers. */}
      <DeckSection cx={0} cz={spineCz} width={SPINE_HALF_LEN * 2} depth={SPINE_W} />

      {/* Three north-going finger piers. */}
      {FINGER_OFFSETS_X.map((fx) => (
        <DeckSection
          key={`finger_${fx}`}
          cx={fx}
          cz={fingerCz}
          width={FINGER_W}
          depth={FINGER_LEN}
        />
      ))}

      {piles.map(([px, pz], i) => (
        <Pile key={`pile_${i}`} x={px} z={pz} />
      ))}
      {bollards.map(([bx, bz], i) => (
        <Bollard key={`bollard_${i}`} x={bx} z={bz} />
      ))}

      <Sailboat x={sailboatX} z={sailboatZ} headingY={0} />
      <Motorboat x={motorboatX} z={motorboatZ} headingY={0} />

      {/* Mooring lines — bow + stern each go to the same finger. */}
      <MooringRope
        ax={sailBowBollard[0]}
        az={sailBowBollard[1]}
        bx={sailboatX - SAILBOAT_HALF_W + 0.05}
        bz={sailboatZ + 2.5}
      />
      <MooringRope
        ax={sailSternBollard[0]}
        az={sailSternBollard[1]}
        bx={sailboatX - SAILBOAT_HALF_W + 0.05}
        bz={sailboatZ - 2.5}
      />
      <MooringRope
        ax={motorBowBollard[0]}
        az={motorBowBollard[1]}
        bx={motorboatX + MOTORBOAT_HALF_W - 0.05}
        bz={motorboatZ + 2.0}
      />
      <MooringRope
        ax={motorSternBollard[0]}
        az={motorSternBollard[1]}
        bx={motorboatX + MOTORBOAT_HALF_W - 0.05}
        bz={motorboatZ - 2.0}
      />
    </group>
  );
}
