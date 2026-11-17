<script setup lang="ts">
import { computed } from 'vue'
import { CONJUNCTION_THRESHOLD_KM, type ConjunctionState } from '../composables/useConjunctions'
import type { Conjunction } from '../orbital/conjunctions'
import type { OmmRecord } from '../types/data-contract'
import { formatNumber } from '../utils/format'

const props = defineProps<{
  state: ConjunctionState
  satellites: readonly OmmRecord[]
  /** The approach currently shown, if any. */
  active: Conjunction | null
}>()

const emit = defineEmits<{ run: []; choose: [c: Conjunction] }>()

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const list = computed(() => (props.state.status === 'done' ? props.state.conjunctions : []))

/** Whole km only: GP data can't support more. Below 1 km reads as "< 1 km". */
function miss(km: number): string {
  return km < 1 ? '< 1 km' : `≈ ${Math.round(km)} km`
}
</script>

<template>
  <section class="conj panel" aria-labelledby="conj-title">
    <header class="conj__header">
      <h2 id="conj-title" class="conj__title">Close approaches</h2>
      <span class="conj__scope">under {{ CONJUNCTION_THRESHOLD_KM }} km · 24 h</span>
    </header>

    <div v-if="state.status === 'idle'" class="conj__idle">
      <p class="conj__hint">Screen the whole catalogue for objects passing near this satellite.</p>
      <button class="btn btn--primary" type="button" @click="emit('run')">Check next 24 hours</button>
    </div>

    <div v-else-if="state.status === 'running'" class="conj__running" role="status">
      <div
        class="conj__bar"
        role="progressbar"
        aria-label="Screening progress"
        :aria-valuenow="Math.round(state.progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span :style="{ transform: `scaleX(${state.progress})` }" />
      </div>
      <p class="conj__hint">Checking {{ satellites.length.toLocaleString('en-US') }} objects…</p>
    </div>

    <p v-else-if="state.status === 'error'" class="conj__error" role="alert">{{ state.message }}</p>

    <template v-else>
      <p v-if="list.length === 0" class="conj__hint">
        Nothing passes within {{ CONJUNCTION_THRESHOLD_KM }} km in the next 24 hours.
      </p>
      <ol v-else class="conj__list">
        <li v-for="c in list" :key="`${c.index}-${c.tcaMs}`">
          <button
            class="approach"
            :class="{ 'approach--active': active?.index === c.index && active.tcaMs === c.tcaMs }"
            type="button"
            @click="emit('choose', c)"
          >
            <span class="approach__main">
              <span class="approach__name">{{ satellites[c.index]?.OBJECT_NAME }}</span>
              <span class="approach__when tabular">{{ dayFormat.format(c.tcaMs) }}, {{ timeFormat.format(c.tcaMs) }}</span>
            </span>
            <span class="approach__nums tabular">
              <span class="approach__miss">{{ miss(c.missKm) }}</span>
              <span class="approach__speed">{{ formatNumber(c.relativeSpeedKmS, 1, 'km/s') }}</span>
            </span>
          </button>
        </li>
      </ol>
      <button class="link conj__again" type="button" @click="emit('run')">Check again from now</button>
    </template>

    <p class="conj__fine">
      Approximate. Public orbital data is accurate to about a kilometre at best and degrades over days, so this is
      not a collision assessment. Docked and formation-flying objects are left out.
    </p>
  </section>
</template>

<style scoped>
.conj {
  width: var(--panel-width);
  max-width: calc(100vw - 2 * var(--edge-gap));
  padding: var(--space-4);
}

.conj__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2);
}

.conj__title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}

.conj__scope,
.conj__fine {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.conj__fine {
  margin: var(--space-3) var(--space-1) 0;
  line-height: var(--leading-normal);
}

.conj__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.conj__idle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.conj__running {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.conj__bar {
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-pressed);
  overflow: hidden;
}

.conj__bar span {
  display: block;
  height: 100%;
  background: var(--color-accent);
  transform-origin: left;
  transition: transform var(--duration-fast) linear;
}

.conj__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-warning);
}

.conj__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  overflow: hidden;
}

.conj__list li + li {
  border-top: var(--hairline);
}

.approach {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: 10px var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.approach:hover,
.approach--active {
  background: var(--color-surface-hover);
}

.approach--active .approach__name::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  vertical-align: middle;
}

.approach__main,
.approach__nums {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.approach__nums {
  align-items: flex-end;
  flex: none;
}

.approach__name {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approach__when,
.approach__speed {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.approach__miss {
  font-size: var(--text-sm);
}

.btn {
  padding: 7px var(--space-3);
  border: none;
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.btn--primary {
  background: var(--color-accent);
  color: #fff;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.conj__again {
  margin-top: var(--space-2);
}
</style>
