import { ecfToLookAngles, geodeticToEcf } from 'satellite.js'
import { describe, expect, it } from 'vitest'
import sampleJson from '../../public/data/sample.json'
import type { OmmRecord, SatelliteFile } from '../types/data-contract'
import { DEG_TO_RAD, RAD_TO_DEG } from './constants'
import { compassPoint, findPasses, sunElevationDeg } from './passes'
import { createSatrec, propagateEcf } from './propagate'

const sample = sampleJson as SatelliteFile
const record = (id: number) => sample.satellites.find((s) => s.NORAD_CAT_ID === id) as OmmRecord

const NEW_YORK = { latDeg: 40.7128, lonDeg: -74.006, heightKm: 0 }

/**
 * Independent reference: Python skyfield 1.55 `EarthSatellite.find_events`
 * (altitude 0°) for the sample's ISS elements over New York, 24 h from
 * 2026-11-17T12:00Z, keeping passes that peak at 10° or more. "visible" is
 * skyfield's is_sunlit (DE421) at the peak with the Sun below -6°.
 */
const SKYFIELD_PASSES = [
  { rise: '2026-11-17T20:32:28.5Z', peak: '2026-11-17T20:37:42.3Z', set: '2026-11-17T20:42:58.6Z', peakEl: 35.378, peakAz: 136.51, riseAz: 212.95, setAz: 60.31, visible: false },
  { rise: '2026-11-17T22:09:16.8Z', peak: '2026-11-17T22:14:30.6Z', set: '2026-11-17T22:19:46.6Z', peakEl: 30.18, peakAz: 333.67, riseAz: 258.18, setAz: 49.16, visible: true },
  { rise: '2026-11-17T23:47:25.1Z', peak: '2026-11-17T23:52:06.1Z', set: '2026-11-17T23:56:48.2Z', peakEl: 13.405, peakAz: 353.46, riseAz: 293.41, setAz: 53.51, visible: false },
  { rise: '2026-11-18T01:25:03.8Z', peak: '2026-11-18T01:29:56.2Z', set: '2026-11-18T01:34:48.7Z', peakEl: 16.183, peakAz: 14.16, riseAz: 310.24, setAz: 77.99, visible: false },
  { rise: '2026-11-18T03:01:50.8Z', peak: '2026-11-18T03:07:16.6Z', set: '2026-11-18T03:12:41.8Z', peakEl: 56.114, peakAz: 33.02, riseAz: 308.41, setAz: 117.48, visible: false },
  { rise: '2026-11-18T04:38:56.2Z', peak: '2026-11-18T04:43:45.3Z', set: '2026-11-18T04:48:34.2Z', peakEl: 16.527, peakAz: 228.96, riseAz: 291.48, setAz: 166.15, visible: false },
]

const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('findPasses: ISS over New York vs skyfield', () => {
  const satrec = createSatrec(record(25544))!
  const result = findPasses(satrec, NEW_YORK, Date.parse('2026-11-17T12:00:00Z'), 86_400_000)

  it('finds the same passes', () => {
    expect(result.kind).toBe('passes')
    if (result.kind !== 'passes') return
    expect(result.passes).toHaveLength(SKYFIELD_PASSES.length)
  })

  it.each(SKYFIELD_PASSES.map((p, i) => [i, p] as const))('pass %d: times within 10 s, angles within 0.5°', (i, ref) => {
    if (result.kind !== 'passes') throw new Error('no passes')
    const p = result.passes[i]!
    expect(Math.abs(p.riseMs - Date.parse(ref.rise))).toBeLessThan(10_000)
    expect(Math.abs(p.peakMs - Date.parse(ref.peak))).toBeLessThan(10_000)
    expect(Math.abs(p.setMs - Date.parse(ref.set))).toBeLessThan(10_000)
    expect(Math.abs(p.peakElDeg - ref.peakEl)).toBeLessThan(0.2)
    expect(azDiff(p.peakAzDeg, ref.peakAz)).toBeLessThan(0.5)
    expect(azDiff(p.riseAzDeg, ref.riseAz)).toBeLessThan(0.5)
    expect(azDiff(p.setAzDeg, ref.setAz)).toBeLessThan(0.5)
    expect(p.visible).toBe(ref.visible)
    expect(p.inProgress).toBe(false)
  })
})

describe('findPasses: edge cases', () => {
  it('reports a geostationary satellite under which the observer sits as always up', () => {
    // GALAXY 36, geostationary.
    const satrec = createSatrec(record(54742))!
    const t = Date.parse('2026-11-17T12:00:00Z')
    const ecf = propagateEcf(satrec, t)!
    const lonDeg = Math.atan2(ecf[1], ecf[0]) * RAD_TO_DEG
    const under = findPasses(satrec, { latDeg: 0, lonDeg, heightKm: 0 }, t, 86_400_000)
    expect(under.kind).toBe('always')
    if (under.kind === 'always') expect(under.elevationDeg).toBeGreaterThan(80)
    const opposite = findPasses(satrec, { latDeg: 0, lonDeg: lonDeg + 180, heightKm: 0 }, t, 86_400_000)
    expect(opposite.kind).toBe('never')
  })

  it('marks a pass already under way at the start as in progress', () => {
    const satrec = createSatrec(record(25544))!
    const result = findPasses(satrec, NEW_YORK, Date.parse('2026-11-17T22:14:30Z'), 3_600_000)
    expect(result.kind).toBe('passes')
    if (result.kind !== 'passes') return
    expect(result.passes[0]!.inProgress).toBe(true)
    expect(result.passes[0]!.riseMs).toBe(Date.parse('2026-11-17T22:14:30Z'))
  })
})

describe('look angles agree with satellite.js', () => {
  it('peak elevation and azimuth match ecfToLookAngles', () => {
    const satrec = createSatrec(record(25544))!
    const result = findPasses(satrec, NEW_YORK, Date.parse('2026-11-17T12:00:00Z'), 86_400_000)
    if (result.kind !== 'passes') throw new Error('no passes')
    const p = result.passes[0]!
    const ecf = propagateEcf(satrec, p.peakMs)!
    const ref = ecfToLookAngles(
      { latitude: NEW_YORK.latDeg * DEG_TO_RAD, longitude: NEW_YORK.lonDeg * DEG_TO_RAD, height: 0 },
      { x: ecf[0], y: ecf[1], z: ecf[2] },
    )
    expect(Math.abs(p.peakElDeg - ref.elevation * RAD_TO_DEG)).toBeLessThan(0.01)
    expect(azDiff(p.peakAzDeg, ref.azimuth * RAD_TO_DEG)).toBeLessThan(0.05)
    // geodeticToEcf is the same WGS84 model as our station position.
    expect(geodeticToEcf({ latitude: 0, longitude: 0, height: 0 }).x).toBeCloseTo(6378.137, 6)
  })
})

describe('helpers', () => {
  it('names compass points', () => {
    expect([0, 44, 46, 90, 180, 225, 270, 315, 359].map(compassPoint)).toEqual([
      'N', 'NE', 'NE', 'E', 'S', 'SW', 'W', 'NW', 'N',
    ])
  })

  it('gives sun elevation at the observer', () => {
    // skyfield: Sun at -7.5° over New York at 2026-11-17T22:14:31Z.
    expect(Math.abs(sunElevationDeg(NEW_YORK, Date.parse('2026-11-17T22:14:31Z')) - -7.5)).toBeLessThan(0.3)
  })
})
