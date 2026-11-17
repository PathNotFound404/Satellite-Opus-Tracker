import { onBeforeUnmount, onMounted, ref } from 'vue'

/** A wall-clock timestamp (ms) that ticks at `intervalMs`. For slow-changing labels only. */
export function useNow(intervalMs = 30_000) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, intervalMs)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
