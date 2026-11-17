import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import type { Conjunction } from '../orbital/conjunctions'
import type { SatelliteFile } from '../types/data-contract'
import type { FromConjunctionWorker, ToConjunctionWorker } from '../workers/conjunction.worker'
import { useSimClock } from './useSimClock'

export const CONJUNCTION_THRESHOLD_KM = 10
const WINDOW_MS = 24 * 3_600_000

export type ConjunctionState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; conjunctions: Conjunction[]; fromMs: number; screenedMs: number }
  | { status: 'error'; message: string }

/**
 * On-demand close-approach screening for the selected satellite. The worker
 * (and its copy of the satrecs) is only created the first time it's used.
 */
export function useConjunctions(file: Ref<SatelliteFile | null>, selectedIndex: Ref<number | null>) {
  const clock = useSimClock()
  const state = shallowRef<ConjunctionState>({ status: 'idle' })
  let worker: Worker | null = null
  let workerFile: SatelliteFile | null = null
  let requestId = 0
  /** Sim time the current request started from. */
  let lastStart = 0

  function ensureWorker(f: SatelliteFile): Worker {
    if (worker && workerFile === f) return worker
    worker?.terminate()
    worker = new Worker(new URL('../workers/conjunction.worker.ts', import.meta.url), { type: 'module' })
    workerFile = f
    worker.onmessage = (event: MessageEvent<FromConjunctionWorker>) => {
      const msg = event.data
      if (msg.id !== requestId) return // a newer request replaced this one
      if (msg.type === 'progress') state.value = { status: 'running', progress: msg.fraction }
      else if (msg.type === 'error') state.value = { status: 'error', message: msg.message }
      else state.value = { status: 'done', conjunctions: msg.conjunctions, fromMs: lastStart, screenedMs: msg.screenedMs }
    }
    worker.onerror = () => {
      state.value = { status: 'error', message: 'The screening worker failed.' }
    }
    worker.postMessage({ type: 'init', records: f.satellites } satisfies ToConjunctionWorker)
    return worker
  }

  function run(): void {
    const f = file.value
    const index = selectedIndex.value
    if (!f || index === null) return
    const w = ensureWorker(f)
    requestId++
    lastStart = clock.now()
    state.value = { status: 'running', progress: 0 }
    w.postMessage({
      type: 'screen',
      id: requestId,
      primaryIndex: index,
      startMs: lastStart,
      durationMs: WINDOW_MS,
      thresholdKm: CONJUNCTION_THRESHOLD_KM,
    } satisfies ToConjunctionWorker)
  }

  // A different satellite: results no longer apply; drop any in-flight request.
  watch(selectedIndex, () => {
    requestId++
    state.value = { status: 'idle' }
  })

  onBeforeUnmount(() => worker?.terminate())

  return { state, run }
}
