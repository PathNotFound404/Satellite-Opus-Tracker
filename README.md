# Satellite Tracker

[![ci](https://github.com/PathNotFound404/Satellite-Opus-Tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/PathNotFound404/Satellite-Opus-Tracker/actions/workflows/ci.yml)

Thousands of real satellites moving in real time on an interactive 3D globe. Orbital data comes from CelesTrak, and every position is computed in your browser with SGP4. There is no backend.

**Live site:** _coming soon (Vercel deploy pending)_

## Status

| Milestone | State |
|---|---|
| 1. Scaffold, globe, CI | Done |
| 2. Data pipeline | Done (deploy pending) |
| 3. Propagate and plot | Done |
| 4. Select, info panel, orbit | Done |
| 5. Search and filters | Done |
| 6. Stretch features | Done: time controls, day/night, ground track, pass predictor, close approaches |

See [docs/roadmap.md](docs/roadmap.md).

## How it works

1. **Data:** a scheduled GitHub Actions workflow fetches CelesTrak's GP data (OMM JSON) every 6 hours, validates it and deploys it as one static JSON file. The browser never calls CelesTrak.
2. **Orbit math:** a Web Worker runs SGP4 ([satellite.js](https://github.com/shashwatak/satellite-js)) for every satellite once a second and converts TEME to Earth-fixed coordinates with GMST.
3. **Rendering:** all satellites are one three.js `Points` draw call. The vertex shader interpolates between the two latest keyframes, so the main thread does almost nothing per frame. See [ADR 0002](docs/adr/0002-propagation-strategy.md).

Click any satellite for its altitude, speed, inclination, period, orbit (blue) and ground track (white: the last orbit dim, the next one bright). Search by name or NORAD ID (try "ISS"), or filter to stations, Starlink, GPS or weather satellites. Esc clears the selection. Time controls at the bottom pause, rewind or speed up to 1000x (Space, `[` and `]`), and **Now** returns to real time. **Day and night** shades the Earth from the Sun's position at the shown time and dims satellites in Earth's shadow.

**Passes over you** lists when the selected satellite crosses your sky in the next 24 hours, marks passes you can see with the naked eye, and jumps to any of them. Your location stays in your browser.

**Close approaches** screens the whole catalogue for objects passing within 10 km of the selected satellite in the next 24 hours (approximate; see [ADR 0003](docs/adr/0003-conjunction-screening.md)).

Add `?debug` to the URL for frame timing and propagation stats.

## Tech stack

Vue 3 + Vite + TypeScript, three.js, satellite.js, Vitest, GitHub Actions, Vercel.

## Run locally

Requires Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Unit tests | `npm test` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |

## Docs

[Project brief](docs/project-brief.md) · [Architecture](docs/architecture.md) · [Data contract](docs/data-contract.md) · [CI/CD](docs/ci-cd.md) · [ADRs](docs/adr/)

## Credits

Earth imagery: NASA Blue Marble (public domain). See [public/textures/ATTRIBUTION.md](public/textures/ATTRIBUTION.md).
