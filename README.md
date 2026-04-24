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

Then open the URL printed by Vite. Production build via `npm run build`.

## Controls

- WASD — move · Shift — sprint · Mouse — look · C — orbit camera
- LMB — shoot · F — punch · R — reload · 1/2 — equip weapon
- E — interact (enter vehicles, use shops)
- In vehicles: W/S throttle · A/D steer · E exit

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
