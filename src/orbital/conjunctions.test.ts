import { describe, expect, it } from 'vitest'
import sampleJson from '../../public/data/sample.json'
import type { OmmRecord, SatelliteFile } from '../types/data-contract'
import { altitudeBand, bruteForceConjunctions, screenConjunctions, type ScreeningTarget } from './conjunctions'
import { createSatrec } from './propagate'

const sample = sampleJson as SatelliteFile
const record = (id: number) => sample.satellites.find((s) => s.NORAD_CAT_ID === id) as OmmRecord
const ISS = record(25544)

function target(index: number, r: OmmRecord): ScreeningTarget {
  return { index, satrec: createSatrec(r)!, meanMotionRevPerDay: r.MEAN_MOTION, eccentricity: r.ECCENTRICITY }
}

/**
 * For two circular orbits of equal inclination with nodes raan1 and raan2:
 * the argument-of-latitude offset (orbit 2 minus orbit 1) that puts both at
 * the same plane crossing at the same time.
 */
function crossingPhaseOffsetDeg(incDeg: number, raan1Deg: number, raan2Deg: number): number {
  const rad = Math.PI / 180
  const normal = (raan: number) => [
    Math.sin(incDeg * rad) * Math.sin(raan * rad),
    -Math.sin(incDeg * rad) * Math.cos(raan * rad),
    Math.cos(incDeg * rad),
  ]
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ]
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
  const h1 = normal(raan1Deg)
  const h2 = normal(raan2Deg)
  const line = cross(h1, h2)
  // Argument of latitude of `line` in an orbit: angle from its ascending node, in-plane.
  const u = (raan: number, h: number[]) => {
    const node = [Math.cos(raan * rad), Math.sin(raan * rad), 0]
    return Math.atan2(dot(line, cross(h, node)), dot(line, node)) / rad
  }
  return u(raan2Deg, h2) - u(raan1Deg, h1)
}

describe('screenConjunctions vs brute force', () => {
  // Copies of the ISS orbit with the node shifted by dRaan, phased so they
  // reach one of the two plane crossings at the same moment as the ISS, plus
  // small phase offsets so the miss distances spread from ~0 to ~100 km.
  const primary = createSatrec(ISS)!
  const targets: ScreeningTarget[] = []
  let i = 0
  for (const dRaan of [10, 25, 60]) {
    const base = crossingPhaseOffsetDeg(ISS.INCLINATION, ISS.RA_OF_ASC_NODE, ISS.RA_OF_ASC_NODE + dRaan)
    for (const dPhase of [-1.5, -0.8, -0.3, -0.1, 0, 0.15, 0.4, 1, 2]) {
      targets.push(
        target(i++, {
          ...ISS,
          NORAD_CAT_ID: 90000 + i,
          RA_OF_ASC_NODE: (ISS.RA_OF_ASC_NODE + dRaan) % 360,
          MEAN_ANOMALY: (ISS.MEAN_ANOMALY + base + dPhase + 720) % 360,
        }),
      )
    }
  }
  const start = Date.parse('2026-11-17T12:00:00Z')
  const duration = 3 * 3_600_000
  const threshold = 50

  const screened = screenConjunctions(
    primary,
    { meanMotionRevPerDay: ISS.MEAN_MOTION, eccentricity: ISS.ECCENTRICITY },
    targets,
    start,
    duration,
    { thresholdKm: threshold },
  )
  const brute = bruteForceConjunctions(primary, targets, start, duration, threshold, 1000)

  it('the crafted case has close approaches to find', () => {
    expect(brute.length).toBeGreaterThan(5)
  })

  it('finds every approach the 1 s brute force finds, at the same time and distance', () => {
    for (const b of brute) {
      const match = screened.find((s) => s.index === b.index && Math.abs(s.tcaMs - b.tcaMs) < 2000)
      expect(match, `missed index ${b.index} at ${new Date(b.tcaMs).toISOString()}`).toBeDefined()
      // Brute force is quantised to 1 s, so it can only be equal or slightly farther.
      expect(match!.missKm).toBeLessThanOrEqual(b.missKm + 0.01)
      expect(b.missKm - match!.missKm).toBeLessThan(8)
    }
  })

  it('reports nothing the brute force does not', () => {
    for (const s of screened) {
      expect(brute.some((b) => b.index === s.index && Math.abs(s.tcaMs - b.tcaMs) < 2000)).toBe(true)
    }
  })

  it('gives plausible relative speeds for crossing orbits', () => {
    for (const s of screened) {
      expect(s.relativeSpeedKmS).toBeGreaterThan(0)
      expect(s.relativeSpeedKmS).toBeLessThan(16)
    }
  })
})

describe('co-located catalogue entries', () => {
  it('does not report docked ISS modules (identical elements)', () => {
    const primary = createSatrec(ISS)!
    const nauka = record(49044)
    const result = screenConjunctions(
      primary,
      { meanMotionRevPerDay: ISS.MEAN_MOTION, eccentricity: ISS.ECCENTRICITY },
      [target(1, nauka)],
      Date.parse('2026-11-17T12:00:00Z'),
      3_600_000,
      { thresholdKm: 10 },
    )
    expect(result).toEqual([])
  })
})

describe('altitudeBand', () => {
  it('gives perigee and apogee altitudes', () => {
    const [low, high] = altitudeBand(ISS.MEAN_MOTION, ISS.ECCENTRICITY)
    expect(low).toBeGreaterThan(400)
    expect(high).toBeLessThan(440)
    expect(high - low).toBeCloseTo(2 * 6795 * ISS.ECCENTRICITY, -1)
  })
})
