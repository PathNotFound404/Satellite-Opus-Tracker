/**
 * Freshness guard for the data-refresh workflow.
 *
 * Sets the step output `fresh=true` when the live data is under 2 hours old
 * (CelesTrak updates GP data every 2 hours, so fetching again would break the
 * once-per-update rule). Also caches the live file so fetch-data can compare
 * record counts without a second download.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  annotate,
  downloadLiveFile,
  LIVE_CACHE_PATH,
  resolveProductionUrl,
  setGithubOutput,
} from './lib/live-data'

export const MIN_REFRESH_AGE_MS = 2 * 60 * 60 * 1000

async function main(): Promise<void> {
  const productionUrl = resolveProductionUrl()
  if (!productionUrl) throw new Error('PRODUCTION_URL is not set')

  const live = await downloadLiveFile(productionUrl)
  if (!live) {
    console.log('No live data file yet (first run). Continuing.')
    setGithubOutput('fresh', 'false')
    return
  }

  mkdirSync(dirname(LIVE_CACHE_PATH), { recursive: true })
  writeFileSync(LIVE_CACHE_PATH, live.text)

  const ageMs = Date.now() - Date.parse(live.file.generatedAt)
  const ageMin = Math.round(ageMs / 60000)
  if (ageMs < MIN_REFRESH_AGE_MS) {
    annotate('notice', `Live data is ${ageMin} min old (under 2 h). Skipping this run.`)
    setGithubOutput('fresh', 'true')
    return
  }
  console.log(`Live data is ${ageMin} min old. Refreshing.`)
  setGithubOutput('fresh', 'false')
}

main().catch((err: unknown) => {
  annotate('error', `Freshness check failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
