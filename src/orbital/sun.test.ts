import { describe, expect, it } from 'vitest'
import { subsolarPoint, sunDirectionEcf } from './sun'

/**
 * Independent reference: Python skyfield 1.55 with the JPL DE421 ephemeris,
 * apparent Sun position in the ITRS frame, geocentric latitude/longitude.
 */
const REFERENCE = [
  { utc: '2026-06-21T12:00:00Z', latDeg: 23.438, lonDeg: 0.454 },
  { utc: '2026-11-17T18:00:00Z', latDeg: -19.112, lonDeg: -93.747 },
  { utc: '2026-03-20T00:00:00Z', latDeg: -0.243, lonDeg: -178.104 },
]

function lonDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180)
}

describe('subsolarPoint', () => {
  it.each(REFERENCE)('matches skyfield/DE421 within 0.5° at $utc', (ref) => {
    const p = subsolarPoint(Date.parse(ref.utc))
    expect(Math.abs(p.latDeg - ref.latDeg)).toBeLessThan(0.5)
    expect(lonDiff(p.lonDeg, ref.lonDeg)).toBeLessThan(0.5)
  })

  it('moves west by about 15° per hour', () => {
    const a = subsolarPoint(Date.parse('2026-11-17T18:00:00Z'))
    const b = subsolarPoint(Date.parse('2026-11-17T19:00:00Z'))
    expect(lonDiff(a.lonDeg - 15, b.lonDeg)).toBeLessThan(0.1)
  })
})

describe('sunDirectionEcf', () => {
  it('is a unit vector', () => {
    const d = new Float64Array(3)
    sunDirectionEcf(Date.parse('2026-11-17T18:00:00Z'), d)
    expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeCloseTo(1, 12)
  })
})
