import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSimClock } from './useSimClock'

/** Rate steps, in order. Negative = rewind. */
export const RATES = [-1000, -100, -10, -1, 1, 10, 100, 1000] as const
const DISPLAY_INTERVAL_MS = 250
/** Within this of wall time at 1x counts as live. */
const LIVE_TOLERANCE_MS = 2000

/**
 * Reactive view of the simulation clock plus actions. The clock itself stays
 * a plain object; only the displayed values are refs.
 */
export function useTimeControls() {
  const clock = useSimClock()
  const rate = ref(clock.rate)
  const paused = ref(clock.paused)
  const simMs = ref(clock.now())
  const wallMs = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  function refresh(): void {
    rate.value = clock.rate
    paused.value = clock.paused
    simMs.value = clock.now()
    wallMs.value = Date.now()
  }

  const isLive = computed(
    () => !paused.value && rate.value === 1 && Math.abs(simMs.value - wallMs.value) < LIVE_TOLERANCE_MS,
  )

  function setRate(next: number): void {
    clock.setRate(next)
    refresh()
  }

  function step(direction: 1 | -1): void {
    const i = RATES.indexOf(clock.rate as (typeof RATES)[number])
    const from = i < 0 ? RATES.indexOf(1) : i
    const next = RATES[Math.min(RATES.length - 1, Math.max(0, from + direction))]!
    if (clock.paused) clock.setPaused(false)
    setRate(next)
  }

  function togglePause(): void {
    clock.setPaused(!clock.paused)
    refresh()
  }

  function goLive(): void {
    clock.jumpTo(Date.now())
    clock.setRate(1)
    clock.setPaused(false)
    refresh()
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null
    // Never steal keys from text fields or buttons that use Space themselves.
    if (target && (target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey)) return
    if (e.key === ' ' && !target?.closest('button, [role=radio]')) {
      e.preventDefault()
      togglePause()
    } else if (e.key === ']') {
      step(1)
    } else if (e.key === '[') {
      step(-1)
    }
  }

  onMounted(() => {
    timer = setInterval(refresh, DISPLAY_INTERVAL_MS)
    window.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    window.removeEventListener('keydown', onKeydown)
  })

  return { rate, paused, simMs, isLive, step, togglePause, goLive, setRate }
}

/** "10×", "−100×", "1×". */
export function formatRate(rate: number): string {
  const abs = Math.abs(rate)
  return `${rate < 0 ? '−' : ''}${abs.toLocaleString('en-US')}×`
}
