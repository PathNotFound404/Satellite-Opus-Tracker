import { shallowRef } from 'vue'
import { SCHEMA_VERSION, type SatelliteFile } from '../types/data-contract'

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; file: SatelliteFile }
  | { status: 'error'; message: string }

/**
 * Loads /data/satellites.json once. The file is large (10k+ records), so it
 * is held in a shallowRef and never made deeply reactive.
 */
export function useSatelliteData(url = `${import.meta.env.BASE_URL}data/satellites.json`) {
  const state = shallowRef<LoadState>({ status: 'loading' })

  async function load(): Promise<void> {
    state.value = { status: 'loading' }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`The data file returned HTTP ${res.status}.`)
      const file = (await res.json()) as Partial<SatelliteFile>
      if (file.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(
          `The data file uses schema version ${String(file.schemaVersion)}, but this app reads version ${SCHEMA_VERSION}.`,
        )
      }
      if (!Array.isArray(file.satellites) || typeof file.generatedAt !== 'string') {
        throw new Error('The data file is missing required fields.')
      }
      state.value = { status: 'ready', file: Object.freeze(file) as SatelliteFile }
    } catch (err) {
      console.error(err)
      state.value = {
        status: 'error',
        message: err instanceof Error ? err.message : 'The satellite data could not be loaded.',
      }
    }
  }

  void load()
  return { state, reload: load }
}
