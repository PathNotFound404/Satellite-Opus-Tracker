# Satellite Tracker

[![ci](https://github.com/PathNotFound404/Satellite-Opus-Tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/PathNotFound404/Satellite-Opus-Tracker/actions/workflows/ci.yml)

Thousands of real satellites moving in real time on an interactive 3D globe. Orbital data comes from CelesTrak, and every position is computed in your browser with SGP4. There is no backend.

**Live site:** _coming soon (Vercel deploy pending)_

## Status

| Milestone | State |
|---|---|
| 1. Scaffold, globe, CI | Done |
| 2. Data pipeline | Planned |
| 3. Propagate and plot | Planned |
| 4. Select, info panel, orbit | Planned |
| 5. Search and filters | Planned |

See [docs/roadmap.md](docs/roadmap.md).

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
