import { TAG_GROUPS, type SatelliteFile, type TagGroup } from '../types/data-contract'

export type GroupFilter = 'all' | TagGroup

export const GROUP_LABELS: Record<GroupFilter, string> = {
  all: 'All',
  stations: 'Stations',
  starlink: 'Starlink',
  'gps-ops': 'GPS',
  weather: 'Weather',
}

export const GROUP_FILTERS: readonly GroupFilter[] = ['all', ...TAG_GROUPS]

/**
 * Resolve each group's NORAD IDs to satellite array indices, once.
 * IDs not present in `satellites` are ignored.
 */
export function resolveGroups(file: Pick<SatelliteFile, 'satellites' | 'groups'>): Record<TagGroup, Int32Array> {
  const indexById = new Map<number, number>()
  file.satellites.forEach((s, i) => indexById.set(s.NORAD_CAT_ID, i))
  const out = {} as Record<TagGroup, Int32Array>
  for (const group of TAG_GROUPS) {
    const ids = file.groups[group] ?? []
    const indices: number[] = []
    for (const id of ids) {
      const i = indexById.get(id)
      if (i !== undefined) indices.push(i)
    }
    out[group] = Int32Array.from(indices)
  }
  return out
}

/**
 * Fill a 0/1 visibility mask for a filter. Writes into `mask` (no allocation).
 */
export function fillMask(mask: Float32Array, filter: GroupFilter, groups: Record<TagGroup, Int32Array>): void {
  if (filter === 'all') {
    mask.fill(1)
    return
  }
  mask.fill(0)
  const indices = groups[filter]
  for (let k = 0; k < indices.length; k++) mask[indices[k]!] = 1
}
