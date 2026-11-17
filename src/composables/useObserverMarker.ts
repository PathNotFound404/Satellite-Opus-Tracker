import { markRaw, onBeforeUnmount, watch, type Ref, type ShallowRef } from 'vue'
import { ObserverMarker } from '../three/observer-marker'
import type { SceneController } from '../three/scene'
import type { ObserverLocation } from './useObserver'

/** Shows the observer's location on the globe. */
export function useObserverMarker(scene: ShallowRef<SceneController | null>, location: Ref<ObserverLocation | null>) {
  let marker: ObserverMarker | null = null

  watch(
    [scene, location],
    ([s, loc]) => {
      if (s && !marker) {
        marker = markRaw(new ObserverMarker('#f5f5f7', s.renderer.getPixelRatio()))
        s.add(marker.object)
      }
      if (!marker) return
      if (loc) marker.set(loc.latDeg, loc.lonDeg)
      else marker.hide()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (marker && scene.value) scene.value.remove(marker.object)
    marker?.dispose()
  })
}
