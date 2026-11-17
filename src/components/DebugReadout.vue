<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PropagationStats } from '../three/satellite-layer'
import { formatInteger, formatNumber } from '../utils/format'

/** Shown with ?debug in the URL. Frame timing plus propagation counters. */
defineProps<{ stats: PropagationStats | null }>()

const fps = ref(0)
const worstFrameMs = ref(0)
let raf = 0
let frames = 0
let windowStart = 0
let last = 0
let worst = 0

function tick(now: number) {
  if (last) worst = Math.max(worst, now - last)
  last = now
  frames++
  if (now - windowStart >= 1000) {
    fps.value = Math.round((frames * 1000) / (now - windowStart))
    worstFrameMs.value = worst
    frames = 0
    worst = 0
    windowStart = now
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  windowStart = performance.now()
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <dl class="debug panel tabular" aria-label="Debug readout">
    <div><dt>fps</dt><dd>{{ fps }}</dd></div>
    <div><dt>worst frame</dt><dd>{{ formatNumber(worstFrameMs, 1, 'ms') }}</dd></div>
    <template v-if="stats">
      <div><dt>satellites</dt><dd>{{ formatInteger(stats.satellites) }}</dd></div>
      <div><dt>invalid</dt><dd>{{ formatInteger(stats.invalid) }}</dd></div>
      <div><dt>propagate (worker)</dt><dd>{{ formatNumber(stats.lastPropagateMs, 1, 'ms') }}</dd></div>
      <div><dt>satrec init</dt><dd>{{ formatNumber(stats.initMs, 0, 'ms') }}</dd></div>
    </template>
  </dl>
</template>

<style scoped>
.debug {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  display: grid;
  gap: 2px;
  min-width: 200px;
}

.debug div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
}

.debug dt,
.debug dd {
  margin: 0;
}

.debug dd {
  color: var(--color-text);
}
</style>
