<script setup lang="ts">
import { formatInteger } from '../utils/format'
import { GROUP_FILTERS, GROUP_LABELS, type GroupFilter } from '../utils/groups'

defineProps<{ counts: Record<GroupFilter, number> | null }>()
const model = defineModel<GroupFilter>({ required: true })

/** Arrow keys move between options, as in a native radio group. */
function onKeydown(e: KeyboardEvent): void {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const i = GROUP_FILTERS.indexOf(model.value)
  const next = GROUP_FILTERS[(i + step + GROUP_FILTERS.length) % GROUP_FILTERS.length]!
  model.value = next
  const target = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-filter="${next}"]`)
  target?.focus()
}
</script>

<template>
  <div class="filter" role="radiogroup" aria-label="Show satellites" @keydown="onKeydown">
    <button
      v-for="key in GROUP_FILTERS"
      :key="key"
      type="button"
      role="radio"
      class="filter__chip"
      :class="{ 'filter__chip--active': model === key }"
      :aria-checked="model === key"
      :tabindex="model === key ? 0 : -1"
      :data-filter="key"
      @click="model = key"
    >
      <span>{{ GROUP_LABELS[key] }}</span>
      <span v-if="counts" class="filter__count tabular">{{ formatInteger(counts[key]) }}</span>
    </button>
  </div>
</template>

<style scoped>
.filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filter__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px var(--space-3);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.filter__chip:hover {
  background: var(--color-surface-pressed);
}

.filter__chip--active,
.filter__chip--active:hover {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.filter__count {
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
  color: var(--color-text-secondary);
}

.filter__chip--active .filter__count {
  color: var(--color-on-accent);
}
</style>
