<script setup lang="ts">
import { ref } from 'vue'
import GlobeView from './components/GlobeView.vue'

const fatalError = ref<string | null>(null)
</script>

<template>
  <main class="app">
    <GlobeView @error="fatalError = $event" />

    <header class="title panel">
      <h1 class="title__name">Satellite Tracker</h1>
      <p class="title__sub">Live positions from public orbital data</p>
    </header>

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
