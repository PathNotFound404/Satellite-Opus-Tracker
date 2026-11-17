import {
  computed,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Ref,
  type ShallowRef,
} from 'vue'
import { altitudeKm, createSatrec, periodMinutes, propagateTeme, speedKmS, type SatRec } from '../orbital/propagate'
import { parseOmmEpoch } from '../orbital/time'
import { ClickPicker, pickSatellite } from '../three/picking'
import type { SatelliteLayer } from '../three/satellite-layer'
import type { SceneController } from '../three/scene'
import { SelectionLayer } from '../three/selection-layer'
import type { OmmRecord, SatelliteFile } from '../types/data-contract'
import { useSimClock } from './useSimClock'

/** Click tolerance around a point, CSS px. */
const PICK_RADIUS_PX = 12
/** How often the info panel's live values refresh. */
const LIVE_INTERVAL_MS = 250

export interface LiveState {
  altitudeKm: number
  speedKmS: number
}

export interface SelectedSatellite {
  index: number
  record: OmmRecord
  periodMin: number
  epochMs: number
}

function cssToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/**
 * Selection state, click picking, the highlight/orbit layer, and the
 * selected satellite's live values. Only small values are reactive.
 */
export function useSelection(
  scene: ShallowRef<SceneController | null>,
  layer: ShallowRef<SatelliteLayer | null>,
  file: Ref<SatelliteFile | null>,
) {
  const clock = useSimClock()
  const selectedIndex = ref<number | null>(null)
  const live = shallowRef<LiveState | null>(null)
  /** Set when SGP4 fails for the selected satellite (e.g. it has decayed). */
  const propagationFailed = ref(false)

  let satrec: SatRec | null = null
  let selectionLayer: SelectionLayer | null = null
  let picker: ClickPicker | null = null
  let liveTimer: ReturnType<typeof setInterval> | undefined

  const selected = computed<SelectedSatellite | null>(() => {
    const i = selectedIndex.value
    const record = i === null ? undefined : file.value?.satellites[i]
    if (i === null || !record) return null
    return {
      index: i,
      record,
      periodMin: periodMinutes(record.MEAN_MOTION),
      epochMs: parseOmmEpoch(record.EPOCH),
    }
  })

  function select(index: number | null): void {
    selectedIndex.value = index
  }

  function clear(): void {
    selectedIndex.value = null
  }

  function updateLive(): void {
    if (!satrec) {
      live.value = null
      return
    }
    const state = propagateTeme(satrec, clock.now())
    propagationFailed.value = state === null
    live.value = state ? { altitudeKm: altitudeKm(state.rKm), speedKmS: speedKmS(state.vKmS) } : null
  }

  // Build or tear down the three.js side when the scene/layer changes.
  watch(
    [scene, layer],
    ([s, l]) => {
      picker?.dispose()
      selectionLayer?.dispose()
      picker = null
      selectionLayer = null
      if (!s || !l) return
      selectionLayer = markRaw(
        new SelectionLayer(s, l, clock, {
          color: cssToken('--color-sat-selected', '#0a84ff'),
          pixelRatio: s.renderer.getPixelRatio(),
        }),
      )
      picker = markRaw(
        new ClickPicker(s.renderer.domElement, (x, y) => {
          const canvas = s.renderer.domElement
          const hit = pickSatellite(
            l.points,
            l.currentMix,
            s.camera,
            x,
            y,
            canvas.clientWidth,
            canvas.clientHeight,
            PICK_RADIUS_PX,
          )
          // Clicking empty space clears the selection.
          select(hit >= 0 ? hit : null)
        }),
      )
      applySelection()
    },
    { immediate: true },
  )

  function applySelection(): void {
    const sel = selected.value
    satrec = sel ? createSatrec(sel.record) : null
    selectionLayer?.select(sel?.index ?? -1, satrec, sel?.record.MEAN_MOTION ?? 1)
    if (sel) scene.value?.stopAutoRotate()
    updateLive()
  }

  watch(selected, applySelection)

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && selectedIndex.value !== null && !e.defaultPrevented) clear()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    liveTimer = setInterval(updateLive, LIVE_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    clearInterval(liveTimer)
    picker?.dispose()
    selectionLayer?.dispose()
  })

  return { selectedIndex, selected, live, propagationFailed, select, clear }
}
