/**
 * Runs before every build (npm "prebuild").
 *
 * Makes sure public/data/satellites.json exists:
 * 1. Already there (the data-refresh workflow just wrote it): keep it.
 * 2. Otherwise download the current file from our production site.
 * 3. Otherwise copy public/data/sample.json.
 *
 * Never calls CelesTrak. Never fails the build: the sample is always a valid
 * fallback, and the data-age badge makes stale data visible.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { DATA_PATH, downloadLiveFile, resolveProductionUrl, SAMPLE_PATH } from './lib/live-data'

async function main(): Promise<void> {
  if (existsSync(DATA_PATH)) {
    console.log(`pull-live-data: ${DATA_PATH} already exists, keeping it.`)
    return
  }

  const productionUrl = resolveProductionUrl()
  if (productionUrl) {
    try {
      const live = await downloadLiveFile(productionUrl)
      if (live) {
        writeFileSync(DATA_PATH, live.text)
        console.log(
          `pull-live-data: copied live data from ${productionUrl} ` +
            `(${live.file.count} satellites, generated ${live.file.generatedAt}).`,
        )
        return
      }
      console.log(`pull-live-data: ${productionUrl} has no data file yet.`)
    } catch (err) {
      console.log(`pull-live-data: could not use live data (${String(err)}).`)
    }
  } else {
    console.log('pull-live-data: no production URL set.')
  }

  copyFileSync(SAMPLE_PATH, DATA_PATH)
  console.log(`pull-live-data: using ${SAMPLE_PATH}.`)
}

void main()
