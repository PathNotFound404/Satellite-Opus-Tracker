import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'
import { findPasses, type PassResult } from '../orbital/passes'
import { createSatrec, type SatRec } from '../orbital/propagate'
import type { OmmRecord } from '../types/data-contract'
import type { ObserverLocation } from './useObserver'
import { useSimClock } from './useSimClock'

const WINDOW_MS = 24 * 3_600_000
const CHECK_INTERVAL_MS = 1000
/** Recompute at least this often in sim time, so the 24 h window stays current. */
const MAX_AGE_SIM_MS = 3_600_000

/**
 * Next passes of the selected satellite over the observer, in simulation time.
 * Recomputed when the satellite or location changes, when sim time passes
 * the first listed pass, after a time jump, or every simulated hour.
 */
export function usePasses(record: Ref<OmmRecord | null>, observer: Ref<ObserverLocation | null>) {
  const clock = useSimClock()
  const result = shallowRef<PassResult | null>(null)
  const computedForMs = shallowRef(0)
  let satrec: SatRec | null = null
  let computedEpoch = -1
  let timer: ReturnType<typeof setInterval> | undefined

  function compute(): void {
    const o = observer.value
    if (!satrec || !o) {
      result.value = null
      return
    }
    const start = clock.now()
    result.value = findPasses(satrec, o, start, WINDOW_MS, { minPeakDeg: 10 })
    computedForMs.value = start
    computedEpoch = clock.epoch
  }

  function maybeRecompute(): void {
    if (!satrec || !observer.value) return
    const now = clock.now()
    const r = result.value
    const firstEnd = r?.kind === 'passes' && r.passes[0] ? r.passes[0].setMs : Infinity
    const stale =
      clock.epoch !== computedEpoch ||
      now > firstEnd ||
      now < computedForMs.value ||
      Math.abs(now - computedForMs.value) > MAX_AGE_SIM_MS
    if (stale) compute()
  }

  watch(
    [record, observer],
    ([r]) => {
      satrec = r ? createSatrec(r) : null
      compute()
    },
    { immediate: true },
  )

  onMounted(() => {
    timer = setInterval(maybeRecompute, CHECK_INTERVAL_MS)
  })
  onBeforeUnmount(() => clearInterval(timer))

  /** Jump the simulation to just before a pass and run at real time. */
  function jumpTo(ms: number): void {
    clock.jumpTo(ms)
    clock.setRate(1)
    clock.setPaused(false)
    compute()
  }

  return { result, jumpTo }
}
