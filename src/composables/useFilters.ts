import { computed, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { SatelliteLayer } from '../three/satellite-layer'
import type { SatelliteFile, TagGroup } from '../types/data-contract'
import { fillMask, GROUP_FILTERS, resolveGroups, type GroupFilter } from '../utils/groups'

/**
 * The active group filter and its effect on the point cloud. Filtering edits
 * a 0/1 mask attribute in place; geometry is never rebuilt.
 */
export function useFilters(layer: ShallowRef<SatelliteLayer | null>, file: Ref<SatelliteFile | null>) {
  const active = ref<GroupFilter>('all')

  // Resolved once per data file. Plain typed arrays, not deep-reactive.
  const groups = computed<Record<TagGroup, Int32Array> | null>(() => (file.value ? resolveGroups(file.value) : null))

  const counts = computed<Record<GroupFilter, number> | null>(() => {
    const g = groups.value
    const f = file.value
    if (!g || !f) return null
    const out = { all: f.satellites.length } as Record<GroupFilter, number>
    for (const key of GROUP_FILTERS) if (key !== 'all') out[key] = g[key].length
    return out
  })

  /** Membership lookup for the active filter, for clearing a hidden selection. */
  function includes(index: number): boolean {
    if (active.value === 'all') return true
    const g = groups.value
    if (!g) return true
    const list = g[active.value]
    for (let k = 0; k < list.length; k++) if (list[k] === index) return true
    return false
  }

  watch(
    [active, layer, groups],
    ([filter, l, g]) => {
      if (!l || !g) return
      fillMask(l.points.maskAttr.array as Float32Array, filter, g)
      l.points.maskChanged()
    },
    { immediate: true },
  )

  return { active, counts, includes }
}
