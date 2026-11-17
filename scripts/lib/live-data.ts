/** Helpers for reading the currently deployed data file from our own site. */
import { appendFileSync } from 'node:fs'
import type { SatelliteFile } from '../../src/types/data-contract'
import { assertFileShape } from './build-file'

export const DATA_PATH = 'public/data/satellites.json'
export const SAMPLE_PATH = 'public/data/sample.json'
/** Where the freshness guard leaves the live file for fetch-data to compare against. */
export const LIVE_CACHE_PATH = '.cache/live-satellites.json'

/**
 * The production site's origin. `PRODUCTION_URL` (a GitHub variable) wins;
 * on Vercel builds, the system variable `VERCEL_PROJECT_PRODUCTION_URL`
 * (a bare host name) is used. Returns undefined when neither is set (e.g. CI).
 */
export function resolveProductionUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.PRODUCTION_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelHost) return `https://${vercelHost.replace(/\/+$/, '')}`
  return undefined
}

export function liveDataUrl(productionUrl: string): string {
  return `${productionUrl}/data/satellites.json`
}

/**
 * True for the committed sample (or anything built from it). A production site
 * serving the sample has no real data yet, so it must not count as "fresh" or
 * as a baseline for the record-count check.
 */
export function isSampleFile(file: Pick<SatelliteFile, 'source'>): boolean {
  return /sample/i.test(file.source)
}

/** Downloads and shape-checks the live file. Returns null if it doesn't exist yet (404). */
export async function downloadLiveFile(
  productionUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ file: SatelliteFile; text: string } | null> {
  const res = await fetchImpl(liveDataUrl(productionUrl), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Live data request returned HTTP ${res.status}`)
  const text = await res.text()
  const file: unknown = JSON.parse(text)
  assertFileShape(file)
  return { file, text }
}

/** Write `name=value` to the step outputs when running in GitHub Actions. */
export function setGithubOutput(name: string, value: string): void {
  const path = process.env.GITHUB_OUTPUT
  if (path) appendFileSync(path, `${name}=${value}\n`)
}

/** Workflow annotation in Actions, plain log line elsewhere. */
export function annotate(level: 'warning' | 'error' | 'notice', message: string): void {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${message}`)
  else console.log(`[${level}] ${message}`)
}
