<script setup lang="ts">
import { computed, ref } from 'vue'
import DataAgeBadge from './components/DataAgeBadge.vue'
import GlobeView from './components/GlobeView.vue'
import { useSatelliteData } from './composables/useSatelliteData'

const fatalError = ref<string | null>(null)
const { state: data, reload } = useSatelliteData()

const file = computed(() => (data.value.status === 'ready' ? data.value.file : null))
const isSample = computed(() => file.value?.source.toLowerCase().includes('sample') ?? false)
</script>

<template>
  <main class="app">
    <GlobeView @error="fatalError = $event" />

    <header class="title panel">
      <h1 class="title__name">Satellite Tracker</h1>
      <p class="title__sub">Live positions from public orbital data</p>
    </header>

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

.title {
  position: absolute;
  top: var(--edge-gap);
  left: var(--edge-gap);
  padding: var(--space-3) var(--space-4);
  pointer-events: none;
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
