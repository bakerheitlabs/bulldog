## GLTF asset drop zone

Vite serves everything in `/public` at the site root, so a file at
`public/models/foo.glb` is fetched as `/models/foo.glb` from the browser.

### Layout

Each Kenney kit ships a `Textures/colormap.png` that its GLBs reference
**relative to the .glb file** (e.g. `Textures/colormap.png`). Different kits
have different colormaps, so each kit must live in its own subfolder with its
own `Textures/` sibling. Flattening will make models render gray.

```
public/models/
├── city/
│   ├── Textures/colormap.png   (from City Kit Commercial)
│   ├── building_generic.glb
│   └── building_gunstore.glb
└── cars/
    ├── Textures/colormap.png   (from Car Kit)
    ├── car_sedan.glb
    ├── car_sedan_sports.glb
    ├── car_hatchback_sports.glb
    ├── car_suv.glb
    ├── car_suv_luxury.glb
    ├── car_taxi.glb
    └── car_van.glb
```

If any file is missing, the corresponding component falls back to its
primitive mesh — the game still runs.

### Where the assets came from

- Buildings: **Kenney City Kit Commercial** (CC0) — https://kenney.nl/assets/city-kit-commercial
- Cars: **Kenney Car Kit** (CC0) — https://kenney.nl/assets/car-kit

Path mapping lives in [`src/game/world/cityAssets.ts`](../../src/game/world/cityAssets.ts).

### Why primitives as fallback

Colliders and AI (pedestrian/car waypoints, parking slots) are driven by
`cityLayout.ts`, not by model geometry. The GLTF is purely visual — the
primitive box collider stays regardless.
