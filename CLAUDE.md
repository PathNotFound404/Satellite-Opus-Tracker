# CLAUDE.md

Guidance for Claude (and any other coding agent) working in this repo. Keep this file short and current. If something here is wrong, fix it in the same change.

## Project

Live Satellite Tracker: a static web app that shows thousands of real satellites moving in real time on an interactive 3D globe. Users can search and filter satellites, click one to see its stats and orbit, and (stretch) see when it passes over their location.

This is a portfolio project aimed at aerospace software roles. Code quality, a smooth demo at every stage and a clean README matter as much as features.

Full brief: `docs/project-brief.md`. Roadmap and acceptance criteria: `docs/roadmap.md`. Data format: `docs/data-contract.md`. System design: `docs/architecture.md`. Workflows, deploys and CelesTrak fair use: `docs/ci-cd.md`. Decisions: `docs/adr/`. Read the relevant doc before starting a milestone.

## Hard constraints

- **Zero cost, no server.** No backend, no paid APIs, no database. Everything is static files plus client-side code.
- **The browser never calls CelesTrak.** Only the scheduled GitHub Actions workflow fetches orbital data. The app reads the static JSON the workflow produces. This respects rate limits and avoids CORS.
- **All orbit math runs client-side** with `satellite.js` (SGP4).
- **Render satellites as one instanced/points object.** Never create one mesh per satellite. Thousands of individual meshes will not hold framerate.
- **Do not add dependencies without asking.** Prefer what's already in the stack. If a new package is clearly needed, say why in the PR description.

## Stack

| Layer | Choice |
|---|---|
| Front end | Vue 3 (Composition API, `<script setup>`) + Vite + TypeScript |
| 3D | three.js |
| Orbit math | satellite.js |
| Tests | Vitest |
| Data pipeline | GitHub Actions (scheduled) -> static JSON |
| Data source | CelesTrak (prefer OMM JSON over raw TLE text) |
| Hosting | Vercel (auto-deploys on push to `main`) |

## Commands

Package manager: npm. Update this table whenever scripts change.

| Task | Command |
|---|---|
| Install | `npm ci` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Unit tests | `npm test` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Fetch data locally | `npm run fetch-data` |
| Freshness guard (workflow) | `npm run check-freshness` |

Before calling any task done, `typecheck`, `lint`, `test` and `build` must all pass.

## Repo layout

```
.github/workflows/   CI (PR build + tests) and scheduled data fetch
docs/                brief, roadmap, data contract, architecture, ADRs
public/data/         generated satellite JSON (written by the workflow)
scripts/             data fetch script used by the workflow
src/
  components/        Vue components (UI panels, search, controls)
  composables/       Reusable Vue logic (useSatellites, useSelection, etc.)
  three/             three.js scene, globe, point cloud, orbit lines
  orbital/           Pure functions around satellite.js: propagation, frame
                     conversion, look angles, pass prediction
  types/             Shared TypeScript types, including the data contract
  utils/             Small pure helpers (formatting)
  styles/            Design tokens and base styles
  App.vue
  main.ts
```

Keep `src/orbital/` free of Vue and three.js imports. It should be pure, testable TypeScript.

## Conventions

- TypeScript strict mode. No `any` unless commented with a reason.
- Vue: `<script setup lang="ts">`, small single-purpose components, props down and events up.
- Keep three.js objects out of Vue reactivity (use `markRaw` or plain module-level variables). Reactive wrappers around large three.js objects hurt performance.
- No allocations inside the per-frame render loop. Reuse vectors and typed arrays.
- Name units in variables or comments (`altitudeKm`, `speedKmS`). Never mix km and scene units silently; convert in one place.
- Small, focused commits with clear messages. One milestone or feature per PR.
- Comments explain why, not what.

## Design direction

The owner wants a clean, modern UI inspired by Apple's product design.

- Dark, calm canvas: the globe is the hero. UI floats over it in a few translucent panels (backdrop blur, hairline borders, soft large radii).
- System font stack (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Segoe UI`, `system-ui`, ...). No web font downloads. Tabular numerals for live values.
- Restraint: one accent color, generous spacing, few borders, no gradients-for-decoration, no emoji icons. Short sentence-case labels.
- Motion is subtle and quick (150-250 ms ease-out) and respects `prefers-reduced-motion`.
- Design tokens (colors, radii, spacing, blur) live as CSS custom properties in `src/styles/tokens.css`. Components use tokens, never raw values.
- Accessible: visible focus rings, keyboard reachable controls, text contrast at least 4.5:1 over the globe.

## Orbital math rules

These are the easiest places to introduce subtle bugs. Be careful.

- `satellite.js` returns positions in the **TEME** frame. Convert to Earth-fixed (ECF) using GMST before plotting on a rotating Earth. Do this in one function in `src/orbital/` and test it.
- Altitude = distance from Earth's center minus Earth radius (use a consistent radius constant). Speed comes from the velocity vector magnitude.
- Handle propagation failures: `satellite.js` returns `false` for decayed or invalid satellites. Skip them without crashing and without leaving a bad point on screen.
- TLE accuracy degrades over days. Show the data's `generatedAt` age in the UI and never imply sub-kilometer accuracy.
- Add tests with known-good reference values (for example published SGP4 test vectors or a known ISS position) rather than tests that only re-run the same code.

## Performance targets

- 60fps with the full Starlink + active catalog (roughly 10k+ points) on a mid-range laptop.
- If per-frame propagation of every satellite is too slow on the main thread, move it to a Web Worker or propagate at a lower rate and interpolate. Record the decision in `docs/adr/`.
- Click picking must stay responsive with all points loaded.

## Data pipeline

- The scheduled workflow fetches from CelesTrak every 6 hours, writes JSON matching `docs/data-contract.md`, and deploys it with the Vercel CLI. Data is never committed (ADR 0001).
- CelesTrak fair use: never download the same group more than once per 2-hour update, stop on the first non-200 response with no retries, and never fetch `starlink` separately (it's a subset of `active`). Full rules in `docs/ci-cd.md`.
- If the fetch fails, **keep the last good file**. Never overwrite good data with an empty or partial result.
- Until the pipeline exists, develop against the sample file in `public/data/sample.json`.

## CI/CD

- Every PR runs install, typecheck, lint, tests and build via GitHub Actions.
- Merging to `main` triggers a Vercel redeploy automatically.
- Do not change workflow files, deploy settings or secrets without asking.

## Working style

- Work one roadmap milestone at a time. Each should leave the app demoable.
- Before a large or ambiguous change, state the plan briefly and confirm.
- If a requirement conflicts with a hard constraint above, stop and flag it instead of working around it.
- Do not mark a milestone done until its acceptance criteria in `docs/roadmap.md` are met.
- Keep the README current as features land (badge, GIF, how it works).

## Out of scope (for now)

User accounts, a custom backend, saving user data, mobile-native apps, and anything that costs money.