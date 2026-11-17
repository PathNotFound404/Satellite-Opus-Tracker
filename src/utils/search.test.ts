import { describe, expect, it } from 'vitest'
import sampleJson from '../../public/data/sample.json'
import type { SatelliteFile } from '../types/data-contract'
import { buildSearchIndex, searchSatellites } from './search'

const sample = sampleJson as SatelliteFile

const records = [
  { OBJECT_NAME: 'SWISSCUBE', NORAD_CAT_ID: 35932 },
  { OBJECT_NAME: 'ISS (DESTINY)', NORAD_CAT_ID: 26700 },
  { OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 },
  { OBJECT_NAME: 'ISS (NAUKA)', NORAD_CAT_ID: 49044 },
  { OBJECT_NAME: 'AISSAT 4', NORAD_CAT_ID: 68454 },
  { OBJECT_NAME: 'OUTPOST MISSION 2', NORAD_CAT_ID: 58334 },
  { OBJECT_NAME: 'STARLINK-1007', NORAD_CAT_ID: 44713 },
  { OBJECT_NAME: 'NAVSTAR 48 (USA 151)', NORAD_CAT_ID: 26407 },
]
const index = buildSearchIndex(records)
const names = (q: string, limit?: number) => searchSatellites(index, q, limit).map((e) => e.name)

describe('searchSatellites', () => {
  it('finds the ISS (ZARYA) first for "ISS", case-insensitively', () => {
    expect(names('iss')[0]).toBe('ISS (ZARYA)')
    expect(names('ISS').slice(0, 3)).toEqual(['ISS (ZARYA)', 'ISS (NAUKA)', 'ISS (DESTINY)'])
  })

  it('ranks prefix, then word start, then substring matches', () => {
    expect(names('ISS')).toEqual([
      'ISS (ZARYA)',
      'ISS (NAUKA)',
      'ISS (DESTINY)',
      'AISSAT 4',
      'SWISSCUBE',
      'OUTPOST MISSION 2',
    ])
    expect(names('zarya')).toEqual(['ISS (ZARYA)'])
  })

  it('matches NORAD IDs exactly or by prefix', () => {
    expect(names('25544')).toEqual(['ISS (ZARYA)'])
    expect(names('447')).toEqual(['STARLINK-1007'])
  })

  it('still matches digits inside names', () => {
    expect(names('1007')).toEqual(['STARLINK-1007'])
    expect(names('151')).toEqual(['NAVSTAR 48 (USA 151)'])
  })

  it('returns nothing for blank queries and respects the limit and filter', () => {
    expect(names('   ')).toEqual([])
    expect(names('ISS', 2)).toHaveLength(2)
    const onlyOdd = searchSatellites(index, 'ISS', 8, (i) => i % 2 === 1).map((e) => e.name)
    expect(onlyOdd).not.toContain('ISS (ZARYA)')
  })

  it('works on the committed sample', () => {
    const sampleIndex = buildSearchIndex(sample.satellites)
    expect(searchSatellites(sampleIndex, 'ISS')[0]?.noradId).toBe(25544)
  })
})
