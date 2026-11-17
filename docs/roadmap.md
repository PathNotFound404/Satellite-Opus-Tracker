# Roadmap

Each milestone ends with a demoable app on the live Vercel URL. Work one milestone at a time, one PR per milestone (or per feature for stretch work). A milestone is done only when every acceptance criterion below is met **and** `typecheck`, `lint`, `test` and `build` pass in CI.

Related docs: [project brief](project-brief.md), [architecture](architecture.md), [CI/CD plan](ci-cd.md), [data contract](data-contract.md).

| # | Milestone | Demo at the end |
|---|---|---|
| 1 | Scaffold, globe, CI, deploy | A rotating textured Earth at a live URL |
| 2 | Data pipeline | Live site serves fresh CelesTrak data every 6 hours |
| 3 | Propagate and plot | 10k+ satellites moving in real time |
| 4 | Select, info panel, orbit | Click a satellite, see its stats and orbit |
| 5 | Search and filters | Find the ISS; show only Starlink or GPS |
| 6 | Stretch features | One feature per PR |
| 7 | Polish and README | Portfolio-ready repo with GIF and write-up |

---

## M1: Scaffold, globe, CI, deploy

Set up the project and ship the first visible result.

**Scope**
- Vue 3 + Vite + TypeScript (strict) scaffold, with ESLint and Vitest configured.
- npm scripts matching the table in `CLAUDE.md`: `dev`, `build`, `test`, `typecheck`, `lint` (`fetch-data` comes in M2).
- Node LTS version pinned in `.nvmrc` and `package.json` `engines`.
- three.js scene: textured Earth (public-domain texture such as NASA Blue Marble), lighting, orbit controls (rotate and zoom).
- `ci.yml` workflow running on PRs and pushes to `main` (see [ci-cd.md](ci-cd.md)).
- Vercel project connected to the GitHub repo: production deploys from `main`, preview deploys on PRs.
- README with project description, CI status badge and live URL.

**Acceptance criteria**
- [ ] `npm ci && npm run dev` shows a textured Earth that can be rotated and zoomed.
- [ ] Holds 60fps on a mid-range laptop.
- [ ] CI runs on a PR and blocks merge on failure (branch protection on `main`, see [ci-cd.md](ci-cd.md#branch-protection)).
- [ ] Merging to `main` deploys to the production URL; PRs get a preview URL.
- [ ] README shows the CI badge and the live link.

## M2: Data pipeline

Get real orbital data onto the live site without the browser ever calling CelesTrak.

**Scope**
- Write [data-contract.md](data-contract.md) types into `src/types/`.
- `scripts/fetch-data` (Node, TypeScript): fetches the CelesTrak groups, validates, writes `public/data/satellites.json`. Exposed as `npm run fetch-data`.
- `scripts/pull-live-data`: used by every build to copy the current production data into the build (falls back to `public/data/sample.json`).
- `public/data/sample.json`: small committed sample (about 50 satellites incl. ISS, a few Starlink, GPS, weather) for development and tests.
- `data-refresh.yml` scheduled workflow (every 6 hours) that fetches, validates and deploys with the Vercel CLI. Full spec in [ci-cd.md](ci-cd.md#data-refresh-workflow), including CelesTrak fair use.
- ADR 0001 (already written) records the delivery decision.
- App loads the JSON once at startup and shows the data's age (`generatedAt`).

**Acceptance criteria**
- [ ] The scheduled workflow runs at least twice on its own and the live site's `generatedAt` updates.
- [ ] Requests follow every rule in [CelesTrak fair use](ci-cd.md#celestrak-fair-use): at most one download of each group per 2-hour update, stop on the first non-200, no retries.
- [ ] A forced failure (bad URL, empty response, too few records) leaves the live data unchanged. Tested by unit tests on the validator and by one manual run.
- [ ] A normal push to `main` deploys with the current live data, not the sample.
- [ ] The UI shows "Data updated X hours ago".
- [ ] Generated data is never committed (`public/data/satellites.json` is in `.gitignore`).

## M3: Propagate and plot

**Scope**
- `src/orbital/`: propagation wrapper around satellite.js, TEME→ECF conversion with GMST, altitude and speed helpers. Pure TypeScript, no Vue or three.js imports.
- Unit tests against known-good reference values (published SGP4 test vectors, e.g. Vallado's `SGP4-VER.TLE` cases).
- One `THREE.Points` (or instanced) object for all satellites, positions written into a reused typed array.
- Simulation clock module (single source of "now"), ready for time controls later.
- Measure per-frame propagation cost for the full catalog. Decide main thread vs Web Worker vs lower-rate propagation with interpolation, and record it in `docs/adr/0002-propagation-strategy.md`.

**Acceptance criteria**
- [ ] All satellites from the live data render and move in real time.
- [ ] 60fps with the full catalog (10k+ points) on a mid-range laptop, measured and noted in the ADR.
- [ ] Decayed or invalid satellites (satellite.js returns `false`/errors) are skipped: no crash, no point at the origin.
- [ ] TEME→ECF conversion has tests with reference values. The ISS position matches an independent source (e.g. a published reference position for a given epoch) within a few km.
- [ ] No allocations inside the render loop (check with a browser performance profile).

## M4: Select, info panel, orbit line

**Scope**
- Click picking on the point cloud.
- Info panel: name, NORAD ID, altitude (km), speed (km/s), inclination (deg), period (min), data epoch.
- Orbit line for the selected satellite (one orbital period, sampled positions).
- Highlight the selected point.

**Acceptance criteria**
- [ ] Clicking a satellite selects it within one frame or so, with all points loaded.
- [ ] Panel values update live and use correct units. Altitude and speed for the ISS fall in plausible ranges (about 400–430 km, about 7.66 km/s).
- [ ] The orbit line passes through the satellite's current position.
- [ ] Clicking empty space or pressing Esc clears the selection.

## M5: Search and filters

**Scope**
- Search by name or NORAD ID with a result list.
- Group filter: All, Stations, Starlink, GPS, Weather (from the `groups` index in the data contract).
- Selecting a search result selects the satellite and moves the camera to it.

**Acceptance criteria**
- [ ] Typing "ISS" finds the ISS (ZARYA) and selecting it shows its panel.
- [ ] Each filter shows only its group; counts are shown.
- [ ] Filtering hides points without rebuilding the geometry (no frame drop when toggling).
- [ ] Search stays responsive with the full catalog loaded.

## M6: Stretch features (one PR each)

Proposed order, easiest and most visible first. Reorder freely.

1. **Time controls:** pause, speed up (e.g. 1x to 1000x), rewind, back to now. Built on the M3 simulation clock.
2. **Day/night shading:** terminator from the sun position at simulation time.
3. **Ground track:** selected satellite's track on the globe surface.
4. **Next-pass predictor:** browser geolocation (with a manual fallback), next passes over the next 24 hours with rise, peak elevation and set times. Tested against an independent pass prediction for a known location and data set.
5. **Conjunction highlighting:** flag close approaches below a threshold. Clearly labeled as approximate (GP data is not suitable for real collision assessment).

Each stretch feature needs its own acceptance criteria written before work starts.

## M7: Polish and README

**Acceptance criteria**
- [ ] README: what it is, live link, GIF, how it works (pipeline + SGP4 + rendering), tech stack, local setup, data attribution to CelesTrak, accuracy note.
- [ ] Lighthouse performance check on the live site, with any large issues fixed.
- [ ] Loading and error states: data load failure, WebGL unavailable.
- [ ] Docs (`architecture.md`, ADRs, `ci-cd.md`) match what was built.