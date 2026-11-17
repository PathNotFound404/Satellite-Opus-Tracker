<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { SceneController } from '../three/scene'

const emit = defineEmits<{
  ready: [controller: SceneController]
  error: [message: string]
}>()

const container = ref<HTMLDivElement | null>(null)
const globeLoaded = ref(false)
// Module-scope style: the controller is never reactive.
let controller: SceneController | null = null

onMounted(() => {
  if (!container.value) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    controller = markRaw(
      new SceneController(container.value, {
        textures: {
          day: `${import.meta.env.BASE_URL}textures/earth-blue-marble.jpg`,
          night: `${import.meta.env.BASE_URL}textures/earth-night.jpg`,
        },
        reducedMotion,
        onGlobeReady: () => {
          globeLoaded.value = true
        },
      }),
    )
    emit('ready', controller)
  } catch (err) {
    console.error(err)
    emit('error', 'Your browser could not start WebGL, which the 3D globe needs.')
  }
})

onBeforeUnmount(() => {
  controller?.dispose()
  controller = null
})
</script>

<template>
  <div
    ref="container"
    class="globe"
    :class="{ 'globe--loaded': globeLoaded }"
    role="img"
    aria-label="Interactive 3D globe. Drag to rotate, scroll or pinch to zoom."
  />
</template>

<style scoped>
.globe {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 600ms var(--ease-out);
  touch-action: none;
  cursor: grab;
}

.globe:active {
  cursor: grabbing;
}

.globe--loaded {
  opacity: 1;
}

.globe :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .globe {
    transition: none;
  }
}
</style>
