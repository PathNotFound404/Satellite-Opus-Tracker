import { markRaw, onBeforeUnmount, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { SatelliteLayer, type PropagationStats } from '../three/satellite-layer'
import type { SceneController } from '../three/scene'
import type { SatelliteFile } from '../types/data-contract'
import { useSimClock } from './useSimClock'

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Creates the satellite point cloud once both the scene and the data exist.
 * The layer itself is never reactive; only a small stats object is exposed.
 */
export function useSatelliteLayer(
  scene: ShallowRef<SceneController | null>,
  file: Ref<SatelliteFile | null>,
) {
  const clock = useSimClock()
  const layer = shallowRef<SatelliteLayer | null>(null)
  const stats = shallowRef<PropagationStats | null>(null)

  watch(
    [scene, file],
    ([s, f]) => {
      layer.value?.dispose()
      layer.value = null
      if (!s || !f) return
      layer.value = markRaw(
        new SatelliteLayer(s, f.satellites, clock, {
          color: cssToken('--color-sat-point', '#c7d4e6'),
          onStats: (next) => {
            stats.value = { ...next }
          },
        }),
      )
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    layer.value?.dispose()
    layer.value = null
  })

  return { layer, stats }
}
