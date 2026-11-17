<script setup lang="ts">
import { computed } from 'vue'
import { formatRate, RATES, useTimeControls } from '../composables/useTimeControls'

const { rate, paused, simMs, isLive, step, togglePause, goLive } = useTimeControls()

const date = computed(() =>
  new Date(simMs.value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }),
)
const time = computed(() =>
  new Date(simMs.value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }),
)
const rateLabel = computed(() => (paused.value ? 'Paused' : formatRate(rate.value)))
const atSlowest = computed(() => rate.value === RATES[0])
const atFastest = computed(() => rate.value === RATES[RATES.length - 1])
</script>

<template>
  <div class="time panel" role="group" aria-label="Time controls">
    <button
      class="time__btn"
      type="button"
      :disabled="atSlowest"
      aria-label="Slower or rewind"
      title="Slower / rewind  ["
      @click="step(-1)"
    >
      <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true">
        <path d="M9 2v12L2 8zM18 2v12l-7-6z" fill="currentColor" />
      </svg>
    </button>
    <button
      class="time__btn time__btn--main"
      type="button"
      :aria-label="paused ? 'Play' : 'Pause'"
      :title="paused ? 'Play  (Space)' : 'Pause  (Space)'"
      @click="togglePause()"
    >
      <svg v-if="paused" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M4 2l10 6-10 6z" fill="currentColor" />
      </svg>
      <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />
      </svg>
    </button>
    <button
      class="time__btn"
      type="button"
      :disabled="atFastest"
      aria-label="Faster"
      title="Faster  ]"
      @click="step(1)"
    >
      <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true">
        <path d="M2 2v12l7-6zM11 2v12l7-6z" fill="currentColor" />
      </svg>
    </button>

    <div class="time__readout" aria-live="off">
      <span class="time__clock tabular">{{ time }} <span class="time__utc">UTC</span></span>
      <span class="time__date">{{ date }}</span>
    </div>

    <span
      class="time__rate tabular"
      :class="{ 'time__rate--live': isLive, 'time__rate--off': !isLive }"
      aria-live="polite"
    >
      <span v-if="isLive" class="time__dot" aria-hidden="true" />{{ isLive ? 'Live' : rateLabel }}
    </span>

    <button v-if="!isLive" class="time__now" type="button" @click="goLive()">Now</button>
  </div>
</template>

<style scoped>
.time {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
  border-radius: var(--radius-pill);
}

.time__btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.time__btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
}

.time__btn:active:not(:disabled) {
  background: var(--color-surface-pressed);
}

.time__btn:disabled {
  color: var(--color-text-tertiary);
  cursor: default;
}

.time__btn--main {
  background: var(--color-surface-hover);
}

.time__readout {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  margin: 0 var(--space-2) 0 var(--space-1);
  min-width: 112px;
}

.time__clock {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
}

.time__utc,
.time__date {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.time__utc {
  font-weight: var(--weight-regular);
}

.time__rate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 52px;
  justify-content: center;
  padding: 4px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.time__rate--live {
  color: var(--color-text-secondary);
}

.time__rate--off {
  background: var(--color-accent-soft);
  color: var(--color-text);
}

.time__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
}

.time__now {
  margin-left: var(--space-1);
  padding: 6px var(--space-3);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
</style>
