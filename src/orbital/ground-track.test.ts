import { describe, expect, it } from 'vitest'
import type { OmmRecord } from '../types/data-contract'
import { RAD_TO_DEG } from './constants'
import { sampleGroundTrack } from './ground-track'
import { createSatrec, periodMinutes } from './propagate'

const ISS: OmmRecord = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  NORAD_CAT_ID: 25544,
  EPOCH: '2026-11-17T08:01:45.793056',
  MEAN_MOTION: 15.4943095,
  ECCENTRICITY: 0.0007381,
  INCLINATION: 51.6318,
  RA_OF_ASC_NODE: 262.2236,
  ARG_OF_PERICENTER: 35.3953,
  MEAN_ANOMALY: 324.7525,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59549,
  BSTAR: 0.00018259,
  MEAN_MOTION_DOT: 9.779e-5,
  MEAN_MOTION_DDOT: 0,
}

describe('sampleGroundTrack', () => {
  const satrec = createSatrec(ISS)!

  it('matches skyfield WGS84 subpoints (independent reference)', () => {
    const out = new Float64Array(4)
    const t0 = Date.parse('2026-11-17T00:00:00Z')
    const t1 = Date.parse('2026-11-17T06:30:00Z')
    expect(sampleGroundTrack(satrec, t0, t1 - t0, 2, out)).toBe(2)
    // skyfield 1.55 wgs84.latlon_of for the same satellite and times.
    expect(Math.abs(out[0]! * RAD_TO_DEG - -46.514566078960506)).toBeLessThan(0.01)
    expect(Math.abs(out[1]! * RAD_TO_DEG - 151.70832843878716)).toBeLessThan(0.01)
    expect(Math.abs(out[2]! * RAD_TO_DEG - 3.4061081115136753)).toBeLessThan(0.01)
    expect(Math.abs(out[3]! * RAD_TO_DEG - 111.38957956477047)).toBeLessThan(0.01)
  })

  it('stays within the inclination band and shifts west each orbit', () => {
    const period = periodMinutes(ISS.MEAN_MOTION) * 60_000
    const count = 241
    const out = new Float64Array(count * 2)
    const start = Date.parse('2026-11-17T10:00:00Z')
    sampleGroundTrack(satrec, start, period / 120, count, out)
    let maxLat = 0
    for (let k = 0; k < count; k++) maxLat = Math.max(maxLat, Math.abs(out[k * 2]! * RAD_TO_DEG))
    // Geodetic latitude peaks slightly above the inclination for LEO.
    expect(maxLat).toBeGreaterThan(51)
    expect(maxLat).toBeLessThan(52.2)
    // After one period the Earth has turned ~23° under the orbit.
    const lon0 = out[1]! * RAD_TO_DEG
    const lon1 = out[120 * 2 + 1]! * RAD_TO_DEG
    const westShift = ((lon0 - lon1 + 540) % 360) - 180
    expect(westShift).toBeGreaterThan(22)
    expect(westShift).toBeLessThan(25)
  })
})
