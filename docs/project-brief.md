# Live Satellite Tracker: Project Brief

**Idea:** A web app that shows thousands of real satellites moving in real time on an interactive 3D globe, using live orbital data. Users can search for a satellite, view its orbit and stats, and see when it will pass over their location.

## Goals
- Build a polished portfolio piece with real aerospace data and orbital mechanics.
- Show front-end, 3D graphics and automation/CI skills in one project.
- Run it at zero cost with no server to maintain.
- Build it in layers so it's demoable at every stage.

## Core features (MVP, today)
1. 3D Earth with satellites plotted at their current positions, updating live.
2. Click a satellite to see its name, altitude, speed, inclination and orbit path.
3. Search and filter by name or group (ISS, Starlink, GPS, weather).

## Stretch features
- Next-pass predictor for the user's location, using browser geolocation.
- Ground track on the map.
- Time controls to pause, speed up or rewind.
- Day/night shading.
- Conjunction (close-approach) highlighting.

## Proposed stack (free, no server)

| Layer | Choice | Why |
|---|---|---|
| Front end | Vue 3 + Vite | Your primary stack |
| 3D rendering | three.js | Globe, satellite points, orbit lines |
| Orbit math | satellite.js (SGP4) | Runs in the browser, so no server load per frame |
| Data pipeline | GitHub Actions (scheduled) | Fetches and publishes TLE data for free |
| Data source | CelesTrak (TLE/OMM feeds) | Free, standard, updated regularly |
| Hosting | Vercel | Free Hobby tier, HTTPS, auto-deploy on push, custom domain |

## Architecture
1. A scheduled GitHub Actions workflow runs every few hours, fetches TLE data from CelesTrak and writes it to a static JSON file. This respects CelesTrak's rate limits and avoids CORS problems.
2. The updated JSON is deployed with the front end to Vercel (via commit to the repo or a build artifact).
3. The Vue app loads the JSON once on startup.
4. satellite.js propagates every satellite's position in the browser each frame.
5. three.js renders them as one instanced point cloud, which keeps thousands of objects smooth.

## Why this route
Free always-on Spring Boot hosting mostly no longer exists: Fly.io and Heroku are gone, Render's free tier sleeps after 15 minutes and has only 512 MB RAM, and Cloud Run and Oracle Cloud need a card. Since TLEs only change every few hours and all orbit math is client-side, a static pipeline gives the same result with no cold starts and no cost.

**Trade-off:** There is no live back-end service. If a Spring Boot API is wanted later, add it on Cloud Run or Render behind the same endpoint shape so the swap is easy.

## CI/CD
- GitHub Actions runs the build (and tests) on every PR.
- Merging to `main` triggers Vercel to redeploy automatically.
- The scheduled TLE workflow keeps the data fresh without manual work.
- Add a status badge to the README.

## Build order
1. Scaffold the Vue app and render a textured Earth.
2. Add the GitHub Actions TLE fetcher and the static JSON output (for now, a local sample file works).
3. Propagate and plot satellites.
4. Click-to-select, info panel and orbit line.
5. Search and filters.
6. Stretch features, one at a time.
7. Polish, a README with a GIF.
8. Deploy to Vercel last. Hosting doesn't affect the build.

## Risks
- Rendering thousands of satellites needs instancing or a shader, not individual meshes.
- TLE accuracy degrades over days, so the refresh schedule matters.
- Free tiers change often, so check current limits before relying on them.

## Cost
$0.