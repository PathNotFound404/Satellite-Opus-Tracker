# Architecture

A static web app. A scheduled GitHub Actions workflow fetches orbital data from CelesTrak and deploys it as a static JSON file to Vercel. The browser loads that file once, runs SGP4 (satellite.js) locally and renders every satellite in a single three.js points object. There is no backend.

Related docs: [project brief](project-brief.md), [roadmap](roadmap.md), [CI/CD plan](ci-cd.md), [data contract](data-contract.md), [ADRs](adr/).

## System overview

```mermaid
flowchart LR
    CT[CelesTrak GP API]
    subgraph GH[GitHub]
        DR[data-refresh.yml<br/>every 6 h]
        CI[ci.yml<br/>PRs + main]
        REPO[(repo: code + sample.json)]
    end
    subgraph V[Vercel]
        PROD[Production site<br/>app + data/satellites.json]
        PREV[PR preview sites]
    end
    B[Browser<br/>Vue + three.js + satellite.js]

    CT -- "4 requests / run" --> DR
    DR -- "vercel deploy --prebuilt --prod" --> PROD
    REPO -- "push to main (Git integration)" --> PROD
    REPO -- "PR (Git integration)" --> PREV
    PROD -- "pull-live-data at build time" --> PROD
    PROD -- "pull-live-data at build time" --> PREV
    PROD -- "static files" --> B
```

Key points:

- **Only `data-refresh.yml` ever talks to CelesTrak.** Neither the browser nor Vercel builds call it.
- **Data is deployed, not committed.** See [ADR 0001](adr/0001-deploy-data-with-vercel-cli.md). The repo only holds a small `sample.json`.
- **Every build gets data the same way:** if `public/data/satellites.json` doesn't exist yet, `scripts/pull-live-data` downloads it from the production site, falling back to `sample.json`. The data-refresh workflow writes the fresh file first, so the pull step skips.
- **The last good file is always the one live.** If a fetch or validation fails, the workflow does not deploy, so production keeps serving the previous data.

## Two deploy paths

| Trigger | Who builds | Data used | Deploy |
|---|---|---|---|
| Push to `main` | Vercel (Git integration) | Current production data via `pull-live-data` | Production |
| Pull request | Vercel (Git integration) | Current production data via `pull-live-data` | Preview URL |
| Schedule (every 6 h) or manual | GitHub Actions + Vercel CLI | Freshly fetched and validated data | Production |

Both paths produce the same build output. The only difference is where `satellites.json` comes from.

## Front-end structure

```
src/
  types/        data contract types (SatelliteFile, OmmRecord, ...)
  orbital/      pure TS: satrec creation, propagation, TEME->ECF, altitude,
                speed, look angles, pass prediction. No Vue, no three.js.
  three/        scene, camera, controls, globe, point cloud, keyframe
                timeline, orbit line, picking, unit conversion (km -> scene)
  workers/      propagation worker (SGP4 for the whole catalog)
  utils/        formatting, simulation clock
  composables/  useSatelliteData (load), useSatelliteLayer, useSelection,
                useSimClock, useFilters
  components/   InfoPanel, SearchBox, GroupFilter, DataAgeBadge, ...
  App.vue
  main.ts
```

### Layer rules

- `orbital/` depends only on `satellite.js` and `types/`. Easy to unit test.
- `three/` depends on `orbital/` and `types/`. It never imports Vue.
- `composables/` and `components/` glue it together. three.js objects are created outside Vue reactivity (module-level variables or `markRaw`), and only small values (selected ID, filter state, panel numbers) are reactive.

## Data flow at runtime

1. **Load:** `useSatelliteData` fetches `/data/satellites.json` once, checks `schemaVersion`, and builds `satrec`s from the OMM records. Records that fail to parse are dropped and counted.
2. **Index:** keep satellites in plain arrays indexed by a stable position `i`. That index is shared by the satrec array, the position buffer, the filter mask and picking. Groups are resolved to index sets once.
3. **Clock:** `useSimClock` is the single source of simulation time (real time at 1x until time controls land).
4. **Propagate (worker, 1 Hz):** for each satellite, `sgp4(satrec, t)` → TEME position (km) → ECF via GMST → scene units → `[x, y, z, valid]` in a transferred `Float32Array` keyframe. Failures set `valid = 0` (see below). See [ADR 0002](adr/0002-propagation-strategy.md).
5. **Render:** one `THREE.Points` whose vertex shader interpolates between the previous and next keyframes with one `uMix` uniform. Each keyframe is uploaded once; per frame the main thread writes one uniform.
6. **Select:** a click (not a drag) is matched to the nearest visible point on screen; the hit index maps back to the satellite. The info panel propagates that one satellite on the main thread 4 times a second for exact altitude and speed. The orbit line is one period sampled in TEME and drawn in a group rotated by −GMST each frame, so it always passes through the satellite.

## Frames, units and constants

These rules exist because frame and unit bugs are silent.

| Concept | Rule |
|---|---|
| satellite.js output | TEME frame, km and km/s |
| Earth-fixed | `orbital/frames.ts` converts TEME→ECF with GMST (`satellite.gstime`). Single function, unit-tested. |
| Earth radius | One constant, `EARTH_RADIUS_KM = 6378.137` (WGS84 equatorial), in `orbital/constants.ts` |
| Altitude | `‖r‖ − EARTH_RADIUS_KM` (spherical approximation; accurate enough for display) |
| Speed | `‖v‖` in km/s |
| Scene units | 1 scene unit = 1 Earth radius. The only km→scene conversion lives in `three/units.ts`. |
| Axes | ECF has z toward the North Pole; three.js is y-up. Remap axes in the same `three/units.ts` function, and align the Earth texture to match (tested visually against a known ground position). |

Because positions are converted to ECF, the Earth mesh does not rotate with time; the satellites move relative to it.

## Propagation strategy (decided in M3)

A full SGP4 pass over the catalog takes 14–23 ms in JS, too much for the main thread every frame. Propagation runs in a Web Worker at 1 Hz and the GPU interpolates between keyframes. Measurements and trade-offs are in [ADR 0002](adr/0002-propagation-strategy.md).

## Invalid and decayed satellites

- satellite.js can return `false` or a position containing `NaN` for decayed or bad elements.
- Such satellites are marked invalid (`valid = 0` in the keyframe): the vertex shader moves the point outside the clip volume, so it's never drawn at the origin or at the last good position.
- They're excluded from search results and counted in the debug readout (add `?debug` to the URL).

## Picking

- Screen-space nearest point within 12 CSS px (`three/picking.ts`), using the same keyframe interpolation as the shader. Points hidden behind the Earth (ray–sphere test) or by filters are skipped. A drag never counts as a click. O(n) per click: about 1 ms for 16,892 points.
- Hover highlighting (if added) would need a cheaper method (throttling or GPU color-ID picking). Decide when needed.

## Lighting

- `orbital/sun.ts` gives the Sun direction (Earth-fixed) from the Astronomical Almanac's low-precision formula (about 0.01°), tested against skyfield + JPL DE421. It's allocation-free, so it runs every frame.
- `three/lighting.ts` holds the Sun direction and a 0–1 shading amount as uniform objects shared by the globe and satellite shaders. No three.js lights are used.
- The globe shader blends the day texture (lit by the solar zenith angle) and a city-lights night texture across a soft twilight band. With shading off, it uses an even key light.
- The satellite shader dims points inside Earth's cylindrical shadow.

## Accuracy and data age

- GP/SGP4 accuracy is on the order of a kilometer at epoch and degrades over days. The UI never shows more than 1 decimal place of km and never implies sub-kilometer accuracy.
- `DataAgeBadge` shows the age from `generatedAt`. Above 24 hours old it shows a warning (the pipeline is probably failing).
- Each record's own `EPOCH` can be older than `generatedAt`. The info panel shows the epoch.

## Performance rules

- One draw call for all satellites.
- No allocations in the render loop: preallocate vectors, typed arrays and the GMST/rotation scratch values.
- Filtering updates a mask (size attribute or alpha) instead of rebuilding geometry.
- Satellite data is not deep-reactive. Store arrays with `shallowRef` or outside Vue.