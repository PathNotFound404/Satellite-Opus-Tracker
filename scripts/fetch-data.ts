/**
 * npm run fetch-data
 *
 * Downloads the CelesTrak groups, validates them and writes
 * public/data/satellites.json. Writes nothing unless every check passes, so
 * a failed run can never replace good data.
 *
 * Every run counts against CelesTrak's once-per-update limit for this IP.
 * For normal development use public/data/sample.json instead.
 *
 * Exit codes: 0 = written, or skipped because CelesTrak has no new data;
 * 1 = any failure (nothing written).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { assertFileShape, buildSatelliteFile } from './lib/build-file'
import { fetchAllGroups } from './lib/celestrak'
import {
  annotate,
  DATA_PATH,
  downloadLiveFile,
  isSampleFile,
  LIVE_CACHE_PATH,
  resolveProductionUrl,
  setGithubOutput,
} from './lib/live-data'

async function liveCount(): Promise<number | undefined> {
  if (existsSync(LIVE_CACHE_PATH)) {
    const cached: unknown = JSON.parse(readFileSync(LIVE_CACHE_PATH, 'utf8'))
    assertFileShape(cached)
    return isSampleFile(cached) ? undefined : cached.count
  }
  const productionUrl = resolveProductionUrl()
  if (!productionUrl) return undefined
  const live = await downloadLiveFile(productionUrl)
  // The sample's 48 records are no baseline for the 80% partial-response check.
  return live && !isSampleFile(live.file) ? live.file.count : undefined
}

async function main(): Promise<void> {
  const previousCount = await liveCount()
  console.log(
    previousCount === undefined
      ? 'No live file to compare against.'
      : `Live file has ${previousCount} satellites.`,
  )

  const outcome = await fetchAllGroups(fetch, (line) => console.log(line))
  if (outcome.kind === 'not-updated') {
    annotate(
      'warning',
      `CelesTrak has no new data for "${outcome.group}" since this IP's last download. Skipping; live data is unchanged.`,
    )
    setGithubOutput('skipped', 'true')
    return
  }

  const { file, droppedInvalid, droppedDuplicate } = buildSatelliteFile({
    responses: outcome.responses,
    liveCount: previousCount,
    generatedAt: new Date(),
  })

  // Write to a temp file and rename, so a crash mid-write can't leave a
  // truncated satellites.json behind.
  mkdirSync(dirname(DATA_PATH), { recursive: true })
  const tmp = `${DATA_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(file))
  renameSync(tmp, DATA_PATH)

  setGithubOutput('skipped', 'false')
  console.log(
    `Wrote ${DATA_PATH}: ${file.count} satellites ` +
      `(stations ${file.groups.stations.length}, starlink ${file.groups.starlink.length}, ` +
      `gps-ops ${file.groups['gps-ops'].length}, weather ${file.groups.weather.length}); ` +
      `dropped ${droppedInvalid} invalid, ${droppedDuplicate} duplicate; ` +
      `downloaded ${(outcome.bytes / 1e6).toFixed(1)} MB.`,
  )
}

main().catch((err: unknown) => {
  annotate('error', `fetch-data failed, nothing written: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
