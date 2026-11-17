import { eciToEcf } from 'satellite.js'
import { describe, expect, it } from 'vitest'
import { temeToEcf, temeVelocityToEcf } from './frames'
import { gmstAt, msToJulian, parseOmmEpoch } from './time'

/**
 * Vallado et al. 2006 (AIAA 2006-6753), TEME -> PEF worked example:
 * 2004-04-06 07:51:28.386009 UTC, dUT1 = -0.4399619 s.
 */
const TEME_KM = [5094.1801621, 6127.6446595, 6380.3445327] as const
const PEF_KM = [-1033.4750313, 7901.3055856, 6380.3445327] as const
const UTC_MS = Date.UTC(2004, 3, 6, 7, 51, 28, 386.009)
const UT1_MS = UTC_MS - 439.9619

describe('temeToEcf', () => {
  it('matches the Vallado TEME -> PEF example to metres when given UT1', () => {
    const out = [0, 0, 0]
    temeToEcf(TEME_KM[0], TEME_KM[1], TEME_KM[2], gmstAt(UT1_MS), out)
    for (let i = 0; i < 3; i++) expect(Math.abs(out[i]! - PEF_KM[i]!)).toBeLessThan(0.002)
  })

  it('stays within 0.5 km of it when given UTC (what the app uses)', () => {
    const out = [0, 0, 0]
    temeToEcf(TEME_KM[0], TEME_KM[1], TEME_KM[2], gmstAt(UTC_MS), out)
    const err = Math.hypot(out[0]! - PEF_KM[0], out[1]! - PEF_KM[1], out[2]! - PEF_KM[2])
    expect(err).toBeLessThan(0.5)
  })

  it('agrees with satellite.js eciToEcf', () => {
    const gmst = gmstAt(UTC_MS)
    const ref = eciToEcf({ x: TEME_KM[0], y: TEME_KM[1], z: TEME_KM[2] }, gmst)
    const out = new Float64Array(3)
    temeToEcf(TEME_KM[0], TEME_KM[1], TEME_KM[2], gmst, out)
    expect(out[0]).toBeCloseTo(ref.x, 9)
    expect(out[1]).toBeCloseTo(ref.y, 9)
    expect(out[2]).toBeCloseTo(ref.z, 9)
  })

  it('preserves vector length', () => {
    const out = [0, 0, 0]
    temeToEcf(1000, 2000, 3000, 1.234, out)
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeCloseTo(Math.hypot(1000, 2000, 3000), 9)
  })
})

describe('temeVelocityToEcf', () => {
  it('gives zero Earth-fixed velocity for a point co-rotating with Earth', () => {
    // A point on the equator at x = 6378 km moving with Earth's rotation.
    const r = 6378.137
    const out = [0, 0, 0]
    temeVelocityToEcf(r, 0, 0, 7.292115146706979e-5 * r, 0, 0, out)
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeLessThan(1e-12)
  })
})

describe('time helpers', () => {
  it('converts the Unix epoch and J2000 to Julian dates', () => {
    expect(msToJulian(0)).toBe(2440587.5)
    expect(msToJulian(Date.UTC(2000, 0, 1, 12))).toBe(2451545)
  })

  it('parses OMM epochs as UTC', () => {
    expect(parseOmmEpoch('2026-11-17T08:01:45.793056')).toBe(Date.UTC(2026, 10, 17, 8, 1, 45, 793))
    expect(parseOmmEpoch('2026-11-17T08:01:45Z')).toBe(Date.UTC(2026, 10, 17, 8, 1, 45))
  })
})
