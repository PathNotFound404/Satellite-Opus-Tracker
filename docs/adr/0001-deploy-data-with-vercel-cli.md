# ADR 0001: Deploy satellite data with the Vercel CLI instead of committing it

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

A scheduled GitHub Actions workflow fetches CelesTrak data every 6 hours. The data has to reach the live site on Vercel, and if a fetch fails the last good data must stay live.

The `active` catalog is 10k+ satellites, several MB of JSON. Options considered:

1. **Commit the JSON to `main`;** Vercel redeploys on push. Simplest, and git keeps the last good file. But git stores every version, so the repo could grow by hundreds of MB a year, and history fills with bot commits.
2. **Commit to a separate `data` branch.** Clean `main` history, but the repo still grows and builds have to pull from another branch.
3. **Deploy from Actions with the Vercel CLI, no commit.** No repo growth or bot commits. Needs a Vercel token as a GitHub secret.
4. **Switch host** to Cloudflare Pages (`wrangler pages deploy`) or GitHub Pages (`actions/deploy-pages`). Same pattern as option 3. Cloudflare also needs a token; GitHub Pages has no built-in PR previews.

## Decision

Option 3. Stay on Vercel and deploy fresh data with `vercel build` + `vercel deploy --prebuilt --prod` from the data-refresh workflow. Normal pushes and PRs keep using Vercel's Git integration. Every build gets current data by downloading the live `satellites.json` from production (`pull-live-data`), with `sample.json` as a fallback.

Last good data is kept by never deploying unless fetch and validation succeed; production keeps serving the previous deploy.

## Consequences

- Repo stays small and history stays clean.
- Three secrets to manage (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).
- Scheduled deploys count toward the Vercel Hobby limit of 100 deployments per day (4 per day at a 6-hour cadence).
- No history of past data files. Workflow artifacts keep the last 7 days for debugging.
- Builds depend on the production site being reachable; if not, they fall back to `sample.json` (the data-age badge makes this visible).
- Pattern is portable: moving to Cloudflare Pages or GitHub Pages later only changes the deploy step.