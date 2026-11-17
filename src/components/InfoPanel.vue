<script setup lang="ts">
import { computed } from 'vue'
import type { LiveState, SelectedSatellite } from '../composables/useSelection'
import { useNow } from '../composables/useNow'
import { formatAge, formatInteger, formatNumber } from '../utils/format'

const props = defineProps<{
  satellite: SelectedSatellite
  live: LiveState | null
  propagationFailed: boolean
}>()

defineEmits<{ close: [] }>()

const now = useNow(60_000)

const epochText = computed(() => {
  const d = new Date(props.satellite.epochMs)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date}, ${time} UTC`
})
const epochAge = computed(() => formatAge(Math.max(0, now.value - props.satellite.epochMs)))
</script>

<template>
  <section class="info panel" aria-labelledby="info-title" aria-live="polite">
    <header class="info__header">
      <div class="info__heading">
        <h2 id="info-title" class="info__name">{{ satellite.record.OBJECT_NAME }}</h2>
        <p class="info__ids tabular">
          NORAD {{ satellite.record.NORAD_CAT_ID }} · {{ satellite.record.OBJECT_ID }}
        </p>
      </div>
      <button class="info__close" type="button" aria-label="Close" title="Close (Esc)" @click="$emit('close')">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <p v-if="propagationFailed" class="info__warning" role="alert">
      No valid position at this time. The satellite may have decayed.
    </p>

    <dl class="info__list tabular">
      <div class="info__row">
        <dt>Altitude</dt>
        <dd>{{ live ? formatNumber(live.altitudeKm, 1, 'km') : '—' }}</dd>
      </div>
      <div class="info__row">
        <dt>Speed</dt>
        <dd>{{ live ? formatNumber(live.speedKmS, 2, 'km/s') : '—' }}</dd>
      </div>
      <div class="info__row">
        <dt>Inclination</dt>
        <dd>{{ formatNumber(satellite.record.INCLINATION, 2) }}°</dd>
      </div>
      <div class="info__row">
        <dt>Period</dt>
        <dd>{{ formatNumber(satellite.periodMin, 1, 'min') }}</dd>
      </div>
      <div class="info__row">
        <dt>Orbits per day</dt>
        <dd>{{ formatNumber(satellite.record.MEAN_MOTION, 2) }}</dd>
      </div>
      <div class="info__row">
        <dt>Element set</dt>
        <dd>
          <span class="info__epoch">{{ epochText }}</span>
          <span class="info__muted">{{ epochAge }}</span>
        </dd>
      </div>
    </dl>

    <p class="info__note">
      SGP4 from public elements; accurate to about a kilometre near epoch.
      Revolution {{ formatInteger(satellite.record.REV_AT_EPOCH) }} at epoch.
    </p>
  </section>
</template>

<style scoped>
.info {
  width: var(--panel-width);
  max-width: calc(100vw - 2 * var(--edge-gap));
  padding: var(--space-4);
  animation: info-in var(--duration-normal) var(--ease-out);
}

@keyframes info-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}

.info__header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.info__heading {
  flex: 1;
  min-width: 0;
}

.info__name {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  overflow-wrap: anywhere;
}

.info__ids {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.info__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.info__close:hover {
  background: var(--color-surface-pressed);
  color: var(--color-text);
}

.info__warning {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: rgba(255, 159, 10, 0.14);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.info__list {
  margin: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  overflow: hidden;
}

.info__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-4);
  padding: 10px var(--space-3);
  font-size: var(--text-md);
}

.info__row + .info__row {
  border-top: var(--hairline);
}

.info__row dt {
  color: var(--color-text-secondary);
}

.info__row dd {
  margin: 0;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.info__epoch {
  font-size: var(--text-sm);
}

.info__muted {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.info__note {
  margin: var(--space-3) var(--space-1) 0;
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  color: var(--color-text-tertiary);
}
</style>
