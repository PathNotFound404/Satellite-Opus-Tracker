<script setup lang="ts">
import { Vector3 } from 'three'
import { computed, ref, shallowRef, watch } from 'vue'
import ConjunctionsPanel from './components/ConjunctionsPanel.vue'
import DataAgeBadge from './components/DataAgeBadge.vue'
import DebugReadout from './components/DebugReadout.vue'
import GlobeView from './components/GlobeView.vue'
import GroupFilter from './components/GroupFilter.vue'
import InfoPanel from './components/InfoPanel.vue'
import PassesPanel from './components/PassesPanel.vue'
import SearchBox from './components/SearchBox.vue'
import TimeControls from './components/TimeControls.vue'
import ToggleRow from './components/ToggleRow.vue'
import { useConjunctions } from './composables/useConjunctions'
import { useFilters } from './composables/useFilters'
import { useLighting } from './composables/useLighting'
import { useObserver } from './composables/useObserver'
import { useObserverMarker } from './composables/useObserverMarker'
import { usePasses } from './composables/usePasses'
import { useSatelliteData } from './composables/useSatelliteData'
import { useSatelliteLayer } from './composables/useSatelliteLayer'
import { useSelection } from './composables/useSelection'
import { useSimClock } from './composables/useSimClock'
import type { Conjunction } from './orbital/conjunctions'
import { createSatrec, propagateEcf } from './orbital/propagate'
import type { SceneController } from './three/scene'
import { ecfKmToScene, latLonToScene } from './three/units'
import { buildSearchIndex } from './utils/search'

const fatalError = ref<string | null>(null)
const { state: data, reload } = useSatelliteData()

const file = computed(() => (data.value.status === 'ready' ? data.value.file : null))
const isSample = computed(() => file.value?.source.toLowerCase().includes('sample') ?? false)

// Already markRaw'd by GlobeView; shallowRef keeps Vue from walking it.
const scene = shallowRef<SceneController | null>(null)
const { layer, stats } = useSatelliteLayer(scene, file)
const { dayNight } = useLighting(scene)
const { selectedIndex, selected, live, propagationFailed, select, clear, highlighted } = useSelection(scene, layer, file)
const { active: activeFilter, counts, includes: filterIncludes } = useFilters(layer, file)

const observer = useObserver()
useObserverMarker(scene, observer.location)
const selectedRecord = computed(() => selected.value?.record ?? null)
const { result: passResult, jumpTo: jumpToTime } = usePasses(selectedRecord, observer.location)

// Jump to just before a pass and look down on the observer, so the pass can be watched.
const observerPoint = [0, 0, 0]
function jumpToPass(ms: number): void {
  jumpToTime(ms)
  const loc = observer.location.value
  if (!loc || !scene.value) return
  latLonToScene(loc.latDeg, loc.lonDeg, 1, observerPoint)
  scene.value.flyToward(flyTarget.set(observerPoint[0]!, observerPoint[1]!, observerPoint[2]!))
}

const { state: conjunctionState, run: runConjunctions } = useConjunctions(file, selectedIndex)
const clock = useSimClock()

// Show a close approach: highlight the other object, jump to 20 s before
// closest approach at real time, and look at where the selected satellite will be.
const approachPoint = [0, 0, 0]
const chosenApproach = shallowRef<Conjunction | null>(null)
watch(highlighted, (i) => {
  if (i === null) chosenApproach.value = null
})
function chooseApproach(c: Conjunction): void {
  if (!filterIncludes(c.index)) activeFilter.value = 'all'
  highlighted.value = c.index
  chosenApproach.value = c
  clock.jumpTo(c.tcaMs - 20_000)
  clock.setRate(1)
  clock.setPaused(false)
  const record = selected.value?.record
  const satrec = record ? createSatrec(record) : null
  const ecf = satrec ? propagateEcf(satrec, c.tcaMs) : null
  if (ecf && scene.value) {
    ecfKmToScene(ecf[0], ecf[1], ecf[2], approachPoint)
    scene.value.flyToward(flyTarget.set(approachPoint[0]!, approachPoint[1]!, approachPoint[2]!))
  }
}

const searchIndex = computed(() => (file.value ? buildSearchIndex(file.value.satellites) : null))
// Satellites that failed to propagate are left out of search results.
function searchable(i: number): boolean {
  const points = layer.value?.points
  return !points || !points.hasKeyframes || points.isValid(i)
}

const flyTarget = new Vector3()
function pickFromSearch(index: number): void {
  if (!filterIncludes(index)) activeFilter.value = 'all'
  select(index)
  const l = layer.value
  if (l && scene.value && l.points.positionOf(index, l.currentMix, flyTarget)) {
    scene.value.flyToward(flyTarget)
  }
}

// A filter that hides the selected satellite also clears the selection.
watch(activeFilter, () => {
  if (selectedIndex.value !== null && !filterIncludes(selectedIndex.value)) clear()
})
const showDebug = new URLSearchParams(window.location.search).has('debug')

// ?debug only: a handle for manual checks and automated browser tests.
if (showDebug) {
  ;(window as unknown as { __satDebug: unknown }).__satDebug = { scene, layer, file, select }
}
</script>

<template>
  <main class="app">
    <GlobeView @ready="scene = $event" @error="fatalError = $event" />

    <header class="controls panel">
      <div class="title">
        <h1 class="title__name">Satellite Tracker</h1>
        <p class="title__sub">Live positions from public orbital data</p>
      </div>
      <SearchBox :index="searchIndex" :include="searchable" @pick="pickFromSearch" />
      <GroupFilter v-model="activeFilter" :counts="counts" />
      <div class="controls__divider" aria-hidden="true" />
      <ToggleRow v-model="dayNight" label="Day and night" hint="Sunlight and Earth's shadow at the shown time" />
    </header>

    <TimeControls class="time-controls" />

    <footer class="status">
      <DataAgeBadge
        v-if="file"
        :generated-at="file.generatedAt"
        :count="file.count"
        :is-sample="isSample"
      />
      <div v-else-if="data.status === 'loading'" class="status__pill panel" role="status">
        Loading satellite data…
      </div>
      <div v-else-if="data.status === 'error'" class="status__pill status__pill--error panel" role="alert">
        <span>Couldn't load satellite data. {{ data.message }}</span>
        <button class="status__retry" type="button" @click="reload()">Try again</button>
      </div>
    </footer>

    <aside class="side">
      <InfoPanel
        v-if="selected"
        :key="selected.index"
        :satellite="selected"
        :live="live"
        :propagation-failed="propagationFailed"
        @close="clear()"
      />
      <PassesPanel
        v-if="selected"
        :satellite-name="selected.record.OBJECT_NAME"
        :location="observer.location.value"
        :locating="observer.locating.value"
        :error="observer.error.value"
        :result="passResult"
        :set-manual="observer.setManual"
        @use-device="observer.useDeviceLocation()"
        @clear-location="observer.clear()"
        @jump="jumpToPass"
      />
      <ConjunctionsPanel
        v-if="selected && file"
        :state="conjunctionState"
        :satellites="file.satellites"
        :active="chosenApproach"
        @run="runConjunctions()"
        @choose="chooseApproach"
      />
    </aside>

    <DebugReadout v-if="showDebug" class="debug" :stats="stats" />

    <div v-if="fatalError" class="fatal panel" role="alert">
      <p class="fatal__title">Can't show the globe</p>
      <p class="fatal__body">{{ fatalError }}</p>
    </div>
  </main>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.controls__divider {
  height: 0;
  border-top: var(--hairline);
}

.controls {
  position: absolute;
  top: var(--edge-gap);
  left: var(--edge-gap);
  width: var(--panel-width);
  max-width: calc(100vw - 2 * var(--edge-gap));
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.title__name {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
}

.title__sub {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.status {
  position: absolute;
  left: var(--edge-gap);
  bottom: var(--edge-gap);
  max-width: calc(100% - 2 * var(--edge-gap));
}

.status__pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.status__pill--error {
  color: var(--color-text);
}

.status__retry {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-accent);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.side {
  position: absolute;
  top: var(--edge-gap);
  right: var(--edge-gap);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: calc(100% - 2 * var(--edge-gap));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.time-controls {
  position: absolute;
  left: 50%;
  bottom: var(--edge-gap);
  transform: translateX(-50%);
}

/* Not enough room for both bottom pills side by side: stack time above status. */
@media (max-width: 1100px) {
  .time-controls {
    left: var(--edge-gap);
    transform: none;
    bottom: calc(var(--edge-gap) + 48px);
  }
}

/* Narrow screens: the info panel becomes a sheet above the bottom pills. */
@media (max-width: 720px) {
  .side {
    top: auto;
    left: var(--edge-gap);
    bottom: calc(var(--edge-gap) + 104px);
    max-height: 52vh;
  }

  .side :deep(.info),
  .side :deep(.passes) {
    width: 100%;
    max-width: none;
  }
}

.debug {
  position: absolute;
  right: var(--edge-gap);
  bottom: var(--edge-gap);
}

.fatal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 360px;
  padding: var(--space-6);
  text-align: center;
}

.fatal__title {
  margin: 0 0 var(--space-2);
  font-weight: var(--weight-semibold);
}

.fatal__body {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}
</style>
