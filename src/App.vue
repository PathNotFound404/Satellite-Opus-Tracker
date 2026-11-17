<script setup lang="ts">
import { Vector3 } from 'three'
import { computed, ref, shallowRef, watch } from 'vue'
import DataAgeBadge from './components/DataAgeBadge.vue'
import DebugReadout from './components/DebugReadout.vue'
import GlobeView from './components/GlobeView.vue'
import GroupFilter from './components/GroupFilter.vue'
import InfoPanel from './components/InfoPanel.vue'
import SearchBox from './components/SearchBox.vue'
import TimeControls from './components/TimeControls.vue'
import { useFilters } from './composables/useFilters'
import { useSatelliteData } from './composables/useSatelliteData'
import { useSatelliteLayer } from './composables/useSatelliteLayer'
import { useSelection } from './composables/useSelection'
import type { SceneController } from './three/scene'
import { buildSearchIndex } from './utils/search'

const fatalError = ref<string | null>(null)
const { state: data, reload } = useSatelliteData()

const file = computed(() => (data.value.status === 'ready' ? data.value.file : null))
const isSample = computed(() => file.value?.source.toLowerCase().includes('sample') ?? false)

// Already markRaw'd by GlobeView; shallowRef keeps Vue from walking it.
const scene = shallowRef<SceneController | null>(null)
const { layer, stats } = useSatelliteLayer(scene, file)
const { selectedIndex, selected, live, propagationFailed, select, clear } = useSelection(scene, layer, file)
const { active: activeFilter, counts, includes: filterIncludes } = useFilters(layer, file)

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
  }

  .side :deep(.info) {
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
