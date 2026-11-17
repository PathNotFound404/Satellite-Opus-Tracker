import { describe, expect, it } from 'vitest'
import type { OmmRecord } from '../types/data-contract'
import { sampleOrbitTeme } from './orbit'
import { createSatrec, periodMinutes, propagateTeme } from './propagate'

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

describe('sampleOrbitTeme', () => {
  const satrec = createSatrec(ISS)!
  const now = Date.parse('2026-11-17T10:00:00Z')
  const period = periodMinutes(ISS.MEAN_MOTION)
  const count = 181
  const out = new Float32Array(count * 3)
  const written = sampleOrbitTeme(satrec, now, period, count, out)

  it('writes every sample for a healthy orbit', () => {
    expect(written).toBe(count)
  })

  it('passes through the current position at the middle sample', () => {
    const state = propagateTeme(satrec, now)!
    const mid = Math.floor(count / 2) * 3
    const err = Math.hypot(out[mid]! - state.rKm[0], out[mid + 1]! - state.rKm[1], out[mid + 2]! - state.rKm[2])
    expect(err).toBeLessThan(0.01)
  })

  it('closes on itself after one period (inertial frame)', () => {
    const last = (count - 1) * 3
    const gapKm = Math.hypot(out[0]! - out[last]!, out[1]! - out[last + 1]!, out[2]! - out[last + 2]!)
    // Nodal regression and drag move it a little; a few tens of km at most.
    expect(gapKm).toBeLessThan(50)
  })
})
