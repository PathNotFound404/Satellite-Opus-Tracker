import { describe, expect, it } from 'vitest'
import sampleJson from '../../public/data/sample.json'
import type { SatelliteFile } from '../types/data-contract'
import { fillMask, resolveGroups } from './groups'

const sample = sampleJson as SatelliteFile

describe('resolveGroups', () => {
  it('maps every group ID in the sample to the matching satellite index', () => {
    const groups = resolveGroups(sample)
    for (const [name, indices] of Object.entries(groups)) {
      expect(indices.length).toBe(sample.groups[name as keyof typeof sample.groups].length)
      for (const i of indices) {
        expect(sample.groups[name as keyof typeof sample.groups]).toContain(sample.satellites[i]!.NORAD_CAT_ID)
      }
    }
    const iss = sample.satellites.findIndex((s) => s.NORAD_CAT_ID === 25544)
    expect(Array.from(groups.stations)).toContain(iss)
  })

  it('ignores IDs that are not in the satellite list', () => {
    const groups = resolveGroups({
      satellites: sample.satellites.slice(0, 1),
      groups: { stations: [sample.satellites[0]!.NORAD_CAT_ID, 1], starlink: [], 'gps-ops': [], weather: [] },
    })
    expect(Array.from(groups.stations)).toEqual([0])
  })
})

describe('fillMask', () => {
  it('shows everything for "all" and only the group otherwise', () => {
    const groups = resolveGroups(sample)
    const mask = new Float32Array(sample.satellites.length)
    fillMask(mask, 'all', groups)
    expect(mask.every((v) => v === 1)).toBe(true)
    fillMask(mask, 'starlink', groups)
    const shown = Array.from(mask).reduce((a, b) => a + b, 0)
    expect(shown).toBe(sample.groups.starlink.length)
    for (const i of groups.starlink) expect(mask[i]).toBe(1)
  })
})
