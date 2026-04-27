# Bulldog

<p align="center">
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/three.js-r169-000000?style=for-the-badge&logo=threedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Rapier-physics-8B5CF6?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Zustand-state-764ABC?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Built%20with-Claude-9333ea?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Built%20with-Codex-FF6B6B?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

A GTA-inspired third-person shooter prototype built in the browser with React
Three Fiber, Rapier physics, and Zustand.

## Stack

- [Vite](https://vitejs.dev) + TypeScript + React
- [three.js](https://threejs.org) via [`@react-three/fiber`](https://github.com/pmndrs/react-three-fiber) and [`@react-three/drei`](https://github.com/pmndrs/drei)
- [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) for physics
- [Zustand](https://github.com/pmndrs/zustand) for state + save/load

## Running

```bash
npm install
npm run dev
```

`npm run dev` starts both the Vite dev server and an Electron window pointing at it. Production build via `npm run build`, then `npm start` to launch the bundled Electron app.

To open in a browser instead (no multiplayer):

```bash
npm run dev:web
```

## Multiplayer

Bulldog ships a built-in host-authoritative multiplayer mode over WebSockets, exposed only in the desktop (Electron) build because browsers cannot accept inbound socket connections.

**Hosting**

1. Main menu → **Multiplayer** → **Host Game**.
2. The screen lists every detected LAN address plus your detected WAN IP. Pick a port (default `7777`), set a name, click **Start Hosting**.
3. Wait in the lobby until peers join. Click **Launch World** to drop everyone into the city together.

**Joining**

1. Main menu → **Multiplayer** → **Join Game**.
2. Enter the host's address (LAN address from their lobby screen for same-Wi-Fi, WAN IP for internet) and port. Click **Connect**.
3. You'll see the lobby and chat. The host launches the world for everyone.

**WAN play (internet)**

LAN play works with no setup. To play across the internet, the host must forward the chosen TCP port (default `7777`) to their machine on their router. The exact steps depend on your router; the WAN address shown in the host screen is what your friends connect to.

**What syncs**

- Player position, rotation, animation, weapon
- Player-driven cars (entry/exit + pose)
- Pedestrians and cops (host runs AI; clients render)
- Gunshots and NPC damage (host raycasts authoritatively)
- World time of day and weather

**What doesn't sync (yet)**

- AI-driven traffic and police cruisers (clients see no AI cars)
- Airplanes (planes still work in MP for the local pilot but aren't replicated)
- Target dummies in the gun range (each player damages their own copy)
- Saves on client side (only the host's session is saved)

**Two windows on one machine for testing**

Launch a second Electron instance with a separate user-data dir so localStorage doesn't collide:

```bash
ELECTRON_USER_DATA_DIR=/tmp/bulldog-2 npm run dev:electron
```

Host on `127.0.0.1:7777` from one window and join from the other.

## Controls

- WASD — move · Shift — sprint · Mouse — look · C — orbit camera
- LMB — shoot · F — punch · R — reload · 1/2/3 — equip weapon
- E — interact (enter vehicles, use shops)
- In vehicles: W/S throttle · A/D steer · E exit · L lights · H horn/siren · G landing gear

## Third-party assets

All runtime models live under [`public/models/`](public/models/) and are
redistributed under the licenses listed below. When you modify or extend this
project, keep the attributions here in sync with what ships.

### Kenney kits (CC0)

Kenney releases his asset kits under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
— no attribution required, but listed here as a courtesy.

- **City Kit Commercial** — buildings in [`public/models/city/`](public/models/city/)
  — <https://kenney.nl/assets/city-kit-commercial>
- **Car Kit** — vehicles in [`public/models/cars/`](public/models/cars/)
  — <https://kenney.nl/assets/car-kit>
- **Mini Characters 1** — player and NPC characters in [`public/models/characters/`](public/models/characters/)
  — <https://kenney.nl/assets/mini-characters-1>

### Poly Pizza

- **Pistol** by **Zsky** — [`public/models/weapons/Pistol.glb`](public/models/weapons/Pistol.glb)
  — [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)
  — via Poly Pizza: <https://poly.pizza/m/3To2e7sKmO>
- **Traffic Light** by **Quaternius** — [`public/models/city/Traffic Light.glb`](public/models/city/Traffic%20Light.glb)
  — [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)
  — via Poly Pizza: <https://poly.pizza/m/lg9AKWejnF>
- **Submachine Gun** by **Quaternius** — [`public/models/weapons/Submachine Gun.glb`](public/models/weapons/Submachine%20Gun.glb)
  — [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)
  — via Poly Pizza: <https://poly.pizza/m/nsP3JukU73>

## Project code

Source code under [`src/`](src/) is authored for this project and released
under the [MIT License](LICENSE). Third-party assets retain their original
licenses as listed above.
