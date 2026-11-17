<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '../composables/useNow'
import { formatAge, formatInteger, STALE_DATA_MS } from '../utils/format'

const props = defineProps<{
  generatedAt: string
  count: number
  isSample: boolean
}>()

const now = useNow()
const ageMs = computed(() => Math.max(0, now.value - Date.parse(props.generatedAt)))
const stale = computed(() => ageMs.value > STALE_DATA_MS)
const exact = computed(() => new Date(props.generatedAt).toUTCString())
</script>

<template>
  <div class="badge panel" :class="{ 'badge--stale': stale }" role="status">
    <span class="badge__dot" aria-hidden="true" />
    <span class="badge__text">
      <span :title="exact">Data updated {{ formatAge(ageMs) }}</span>
      <span class="badge__sep" aria-hidden="true">·</span>
      <span class="tabular">{{ formatInteger(count) }} satellites</span>
      <template v-if="isSample">
        <span class="badge__sep" aria-hidden="true">·</span>
        <span>Sample data</span>
      </template>
    </span>
    <span v-if="stale" class="visually-hidden">Warning: the data is more than a day old.</span>
  </div>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  flex: none;
}

.badge--stale .badge__dot {
  background: var(--color-warning);
}

.badge--stale {
  color: var(--color-text);
}

.badge__sep {
  margin: 0 var(--space-1);
  color: var(--color-text-tertiary);
}
</style>
