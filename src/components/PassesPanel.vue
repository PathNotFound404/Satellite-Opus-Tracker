<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ObserverLocation } from '../composables/useObserver'
import { compassPoint, type Pass, type PassResult } from '../orbital/passes'
import { formatNumber } from '../utils/format'

const props = defineProps<{
  satelliteName: string
  location: ObserverLocation | null
  locating: boolean
  error: string | null
  result: PassResult | null
  /** Returns false (and the parent shows `error`) if the coordinates are invalid. */
  setManual: (lat: string, lon: string) => boolean
}>()

const emit = defineEmits<{
  useDevice: []
  clearLocation: []
  jump: [ms: number]
}>()

const editing = ref(false)
const latText = ref('')
const lonText = ref('')

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const zoneLabel = (() => {
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
})()

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

const passes = computed<Pass[]>(() => (props.result?.kind === 'passes' ? props.result.passes.slice(0, 6) : []))

function startEditing(): void {
  latText.value = props.location ? String(props.location.latDeg) : ''
  lonText.value = props.location ? String(props.location.lonDeg) : ''
  editing.value = true
}

function submit(): void {
  if (props.setManual(latText.value, lonText.value)) editing.value = false
}

function forget(): void {
  editing.value = false
  emit('clearLocation')
}

function durationMin(p: Pass): string {
  return `${Math.max(1, Math.round((p.setMs - p.riseMs) / 60_000))} min`
}

function coords(l: ObserverLocation): string {
  const lat = `${Math.abs(l.latDeg).toFixed(2)}° ${l.latDeg >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(l.lonDeg).toFixed(2)}° ${l.lonDeg >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}
</script>

<template>
  <section class="passes panel" aria-labelledby="passes-title">
    <header class="passes__header">
      <h2 id="passes-title" class="passes__title">Passes over you</h2>
      <span v-if="location && !editing" class="passes__zone">{{ zoneLabel }}</span>
    </header>

    <!-- Location -->
    <div v-if="!location || editing" class="passes__setup">
      <p v-if="!editing" class="passes__hint">
        Set your location to see when {{ satelliteName }} passes overhead in the next 24 hours.
      </p>
      <div class="passes__actions">
        <button class="btn btn--primary" type="button" :disabled="locating" @click="emit('useDevice')">
          {{ locating ? 'Locating…' : 'Use my location' }}
        </button>
        <button v-if="!editing" class="btn" type="button" @click="startEditing">Enter coordinates</button>
      </div>
      <form v-if="editing" class="passes__form" @submit.prevent="submit">
        <label class="field">
          <span>Latitude</span>
          <input v-model="latText" inputmode="decimal" placeholder="40.71" aria-describedby="coord-help" />
        </label>
        <label class="field">
          <span>Longitude</span>
          <input v-model="lonText" inputmode="decimal" placeholder="-74.01" aria-describedby="coord-help" />
        </label>
        <div class="passes__form-actions">
          <button class="btn btn--primary" type="submit">Save</button>
          <button class="btn" type="button" @click="editing = false">Cancel</button>
          <button v-if="location" class="link passes__forget" type="button" @click="forget">Forget location</button>
        </div>
        <p id="coord-help" class="passes__fine">Decimal degrees; south and west are negative.</p>
      </form>
      <p v-if="error" class="passes__error" role="alert">{{ error }}</p>
    </div>

    <template v-else>
      <p class="passes__location">
        <span class="tabular">{{ coords(location) }}</span>
        <button class="link" type="button" @click="startEditing">Change</button>
      </p>

      <p v-if="!result" class="passes__hint">Calculating…</p>
      <p v-else-if="result.kind === 'always'" class="passes__hint">
        Always above your horizon, at {{ formatNumber(result.elevationDeg, 0) }}° elevation toward
        {{ compassPoint(result.azimuthDeg) }}.
      </p>
      <p v-else-if="result.kind === 'never'" class="passes__hint">Never rises above your horizon.</p>
      <p v-else-if="passes.length === 0" class="passes__hint">No passes above 10° in the next 24 hours.</p>
      <ol v-else class="passes__list">
        <li v-for="p in passes" :key="p.riseMs">
          <button
            class="pass"
            type="button"
            :aria-label="`Jump to the pass starting ${dayFormat.format(p.riseMs)} ${timeFormat.format(p.riseMs)}`"
            @click="emit('jump', p.riseMs - 60_000)"
          >
            <span class="pass__when">
              <span class="pass__time tabular">{{ p.inProgress ? 'Now' : timeFormat.format(p.riseMs) }}</span>
              <span class="pass__day">{{ dayFormat.format(p.riseMs) }}</span>
            </span>
            <span class="pass__detail">
              <span class="pass__peak tabular">{{ formatNumber(p.peakElDeg, 0) }}° max</span>
              <span class="pass__path">{{ compassPoint(p.riseAzDeg) }} → {{ compassPoint(p.setAzDeg) }} · {{ durationMin(p) }}</span>
            </span>
            <span v-if="p.visible" class="pass__badge" title="Sunlit satellite in a dark sky">Visible</span>
          </button>
        </li>
      </ol>
      <p v-if="result?.kind === 'passes' && passes.length" class="passes__fine">
        Peaks of 10° or more. "Visible" means sunlit while your sky is dark. Click a pass to jump to it.
      </p>
    </template>
  </section>
</template>

<style scoped>
.passes {
  width: var(--panel-width);
  max-width: calc(100vw - 2 * var(--edge-gap));
  padding: var(--space-4);
  animation: passes-in var(--duration-normal) var(--ease-out);
}

@keyframes passes-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}

.passes__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2);
}

.passes__title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}

.passes__zone,
.passes__fine {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.passes__fine {
  margin: var(--space-2) var(--space-1) 0;
}

.passes__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.passes__setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.passes__actions,
.passes__form-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.passes__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.passes__form-actions,
.passes__form .passes__fine {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.field input {
  height: 32px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-surface-hover);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.passes__forget {
  margin-left: auto;
}

.passes__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-warning);
}

.passes__location {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.btn {
  padding: 7px var(--space-3);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface-hover);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--color-surface-pressed);
}

.btn--primary {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-accent-fill);
  filter: brightness(1.1);
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
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

.passes__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  overflow: hidden;
}

.passes__list li + li {
  border-top: var(--hairline);
}

.pass {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 10px var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.pass:hover {
  background: var(--color-surface-hover);
}

.pass__when {
  display: flex;
  flex-direction: column;
  min-width: 72px;
}

.pass__time {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
}

.pass__day,
.pass__path {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.pass__detail {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pass__peak {
  font-size: var(--text-sm);
}

.pass__badge {
  flex: none;
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: rgba(48, 209, 88, 0.16);
  color: var(--color-success);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
</style>
