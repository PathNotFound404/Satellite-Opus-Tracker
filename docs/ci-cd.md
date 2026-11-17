# CI/CD Plan

Three pieces:

1. **`ci.yml`:** checks every PR and push to `main`.
2. **Vercel Git integration:** deploys `main` to production and PRs to preview URLs.
3. **`data-refresh.yml`:** every 6 hours, fetches CelesTrak data, validates it and deploys it to production with the Vercel CLI.

Related docs: [architecture](architecture.md), [data contract](data-contract.md), [ADR 0001](adr/0001-deploy-data-with-vercel-cli.md).

> Changing workflow files, deploy settings or secrets needs the owner's approval (see `CLAUDE.md`).

---

## CelesTrak fair use

**Rule of thumb: never download the same data more than once per 2-hour update, and stop at the first error.**

CelesTrak's [usage policy](https://celestrak.org/usage-policy.php) (checked 2026-11-16) says:

| Policy point | What CelesTrak says |
|---|---|
| Update rate | "For GP data, updates are once every 2 hours." |
| Download rule | "Only download the data you need, when you are going to use it, and only download data once per update." |
| Enforcement | Since 2026-03-26 the one-download-per-update rule is enforced, starting with the `active` and `starlink` groups. A repeat request in the same update window gets **HTTP 403** ("GP data has not updated since your last successful download…"). |
| Errors | Automated clients "should immediately stop querying when it receives any non-HTTP 200 responses and report the results to a human." |
| IP blocking | More than **50 HTTP errors (301, 403, 404) in 2 hours** sends the IP to the firewall, which needs manual review to remove. |
| 500 / 503 | Stop all requests for at least 15 minutes. |
| Bandwidth | More than 100 MB/day may get the IP firewalled. |
| Compression | Request gzip or brotli whenever possible. |
| Overlap | `starlink` is a subset of `active`, so there is no need to download both. |

### How this project complies

| Rule | Our design |
|---|---|
| Once per update | Schedule is **every 6 hours** (3x the minimum interval). A freshness guard skips the fetch if the live data is less than 2 hours old, which protects manual runs and re-runs. |
| Only what we need | 4 requests per run: `active`, `stations`, `gps-ops`, `weather`. We do **not** fetch `starlink`; Starlink is tagged by name (see [data contract](data-contract.md#groups)). |
| Stop on error | Requests run one at a time. On the first non-200 response, the script stops: no retries, no further requests, no deploy. |
| Report to a human | Any non-200 fails the workflow run, and GitHub emails the repo owner. The expected "not updated since your last download" 403 is the one exception: it ends the run as a skip with a warning annotation. |
| Error budget | At most 1 error per run and 4 runs per day, far below 50 per 2 hours. |
| Bandwidth | Compressed responses (Node `fetch` sends `Accept-Encoding: gzip, deflate, br`). Roughly a few MB per run, well under 100 MB/day. |
| Correct URLs | Only `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=JSON` (the `.org` domain, no legacy URLs that return 301/404). |
| Browser never calls CelesTrak | Enforced by design. The app only reads `/data/satellites.json`. |
| Vercel builds never call CelesTrak | Builds use `pull-live-data` (our own site), never the fetch script. |

**Shared runner IPs:** GitHub-hosted runners share IP addresses with other GitHub users, and CelesTrak limits per IP. Someone else on the same IP could have already downloaded `active` in the current window, so we might get the "not updated" 403 through no fault of ours. The design handles it: treat it as a skip, keep the live data and try again at the next scheduled run. If it happens often, we'll revisit.

**Before using `npm run fetch-data` locally:** each local run counts against your home IP. Use `sample.json` for normal development and only run the real fetch when working on the pipeline.

---

## `ci.yml`: checks

**Triggers:** `pull_request` (all branches), `push` to `main`.

**Job (ubuntu-latest):**

1. Checkout.
2. Set up Node from `.nvmrc`, with npm cache.
3. `npm ci`
4. `npm run typecheck`
5. `npm run lint`
6. `npm test`
7. `npm run build` (uses `sample.json` fallback if the production site isn't reachable; CI should not depend on production being up)

**Settings:**
- `permissions: contents: read`
- `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`
- Third-party actions pinned to a commit SHA.

### Branch protection

On `main`: require a PR, require the `ci` check to pass, no force pushes. Set this up in M1.

---

## Vercel Git integration

- **Production:** every push to `main`.
- **Preview:** every PR, with the preview URL posted on the PR.
- **Build command:** `npm run build`. A `prebuild` script runs `pull-live-data`, which downloads `https://<production-url>/data/satellites.json` into `public/data/` if the file doesn't already exist, else falls back to `sample.json`.
- **Ignored files:** `public/data/satellites.json` is in `.gitignore`.

---

## `data-refresh.yml`: data refresh workflow

**Triggers:**
- `schedule: cron: '23 */6 * * *'` (every 6 hours at minute 23, avoiding the busy top of the hour; GitHub may delay scheduled runs)
- `workflow_dispatch` (manual run, still subject to the freshness guard)

**Settings:**
- `concurrency: data-refresh`, `cancel-in-progress: false` (never two refreshes at once)
- `permissions: contents: read` (it never pushes to the repo)
- `timeout-minutes: 15`

**Secrets and variables:**

| Name | Type | Purpose |
|---|---|---|
| `VERCEL_TOKEN` | secret | Vercel CLI auth |
| `VERCEL_ORG_ID` | secret | From `vercel link` (`.vercel/project.json`) |
| `VERCEL_PROJECT_ID` | secret | From `vercel link` |
| `PRODUCTION_URL` | variable | Used by the freshness guard and `pull-live-data` |

**Steps:**

1. **Setup:** checkout, Node from `.nvmrc`, `npm ci`.
2. **Freshness guard** (`npm run check-freshness`): download the live `satellites.json` and cache it in `.cache/` for the count comparison. If its `generatedAt` is less than 2 hours old, end the run as skipped. If the live file is missing (first ever run), continue.
3. **Fetch** (`npm run fetch-data`): request `active`, `stations`, `gps-ops`, `weather` one at a time.
   - The "not updated since your last download" 403 → stop, skip (warning), success exit, no deploy.
   - Any other non-200 → stop, fail the run, no deploy.
4. **Validate** against [data contract](data-contract.md#validation), including comparing record count with the live file. Failure → fail the run, no deploy.
5. **Write** `public/data/satellites.json`.
6. **Build and deploy:**
   ```
   vercel pull --yes --environment=production --token=$VERCEL_TOKEN
   vercel build --prod --token=$VERCEL_TOKEN
   vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
   ```
   `pull-live-data` sees the fresh file and skips.
7. **Artifact:** upload `satellites.json` as a workflow artifact (7-day retention) for debugging.

**Failure behavior:** any failure before step 6 means nothing is deployed and production keeps the last good data. The app's data-age badge turns to a warning after 24 hours.

---

## Budgets

| Resource | Limit | Our expected use |
|---|---|---|
| Vercel Hobby deployments | 100 per day (all sources count, including previews) | 4 scheduled + own pushes and PRs |
| Vercel Hobby concurrent builds | 1 | A push during a refresh just waits |
| CelesTrak requests | Once per group per 2-hour update | 4 requests every 6 hours |
| CelesTrak errors | 50 per 2 hours per IP | At most 1 per run |
| CelesTrak bandwidth | 100 MB per day | A few MB per run |
| GitHub Actions minutes | Free for public repos | A few minutes per run |

Vercel Hobby is for personal, non-commercial use, which fits a portfolio project. Limits from [Vercel limits](https://vercel.com/docs/limits) (checked 2026-11-16). Free tiers change; recheck before relying on them.

## Known risks

- **Scheduled workflows are disabled after 60 days without repo activity** (public repos). GitHub emails before disabling. Re-enable from the Actions tab, or keep the repo active.
- **Shared runner IP gets the 403** (see above). Handled as a skip.
- **CelesTrak changes URLs or formats.** The validator fails the run rather than deploying bad data.
- **Vercel token expires or is revoked.** The deploy step fails; the live site keeps old data and the age badge warns.