import { onBeforeUnmount, ref, watch, type ShallowRef } from 'vue'
import type { SceneController } from '../three/scene'
import { useSimClock } from './useSimClock'

const STORAGE_KEY = 'sat-tracker:day-night'

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function writePreference(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked (private mode etc.): the toggle still works for this visit.
  }
}

/** Day/night shading driven by simulation time, with an on/off preference. */
export function useLighting(scene: ShallowRef<SceneController | null>) {
  const clock = useSimClock()
  const dayNight = ref(readPreference())
  let unsubscribe: (() => void) | null = null

  watch(
    scene,
    (s) => {
      unsubscribe?.()
      unsubscribe = null
      if (!s) return
      s.lighting.setEnabled(dayNight.value, performance.now())
      // Jump straight to the stored state on load rather than fading in.
      s.lighting.shading.value = dayNight.value ? 1 : 0
      unsubscribe = s.onFrame((nowMs) => s.lighting.update(clock.now(), nowMs))
    },
    { immediate: true },
  )

  watch(dayNight, (on) => {
    writePreference(on)
    scene.value?.lighting.setEnabled(on, performance.now())
  })

  onBeforeUnmount(() => unsubscribe?.())

  return { dayNight }
}
