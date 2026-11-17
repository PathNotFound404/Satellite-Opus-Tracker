import { twoline2satrec } from 'satellite.js'
import { describe, expect, it } from 'vitest'
import type { OmmRecord } from '../types/data-contract'
import {
  altitudeKm,
  createSatrec,
  periodMinutes,
  propagateEcf,
  propagateTeme,
  semiMajorAxisKm,
  speedKmS,
} from './propagate'

const JD_UNIX_EPOCH = 2440587.5
const jdToMs = (jd: number) => (jd - JD_UNIX_EPOCH) * 86_400_000

/**
 * Vallado et al., "Revisiting Spacecraft Track Report #3" (AIAA 2006-6753),
 * verification file SGP4-VER.TLE / tcppver.out, satellite 00005.
 */
describe('propagateTeme: SGP4-VER reference vectors (sat 00005)', () => {
  const satrec = twoline2satrec(
    '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
    '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
  )
  const epochMs = jdToMs(satrec.jdsatepoch)

  it.each([
    [0, [7022.46529266, -1400.08296755, 0.03995155], [1.893841015, 6.405893759, 4.53480725]],
    [
      360,
      [-7154.03120202, -3783.17682504, -3536.19412294],
      [4.741887409, -4.151817765, -2.093935425],
    ],
  ])('t = %d min', (minutes, r, v) => {
    const state = propagateTeme(satrec, epochMs + minutes * 60_000)
    expect(state).not.toBeNull()
    // Millisecond rounding of the epoch moves the satellite a few metres at most.
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(state!.rKm[i]! - r[i]!)).toBeLessThan(0.01)
      expect(Math.abs(state!.vKmS[i]! - v[i]!)).toBeLessThan(1e-5)
    }
  })
})

/**
 * ISS (ZARYA) from the committed sample (CelesTrak, epoch 2026-11-17T08:01Z).
 * Reference values were computed independently with Python skyfield 1.55 +
 * sgp4 2.27 (Vallado's C++ SGP4): TEME from Satrec.sgp4, Earth-fixed from
 * skyfield's ITRS frame (which uses UT1 and its own GMST implementation).
 */
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

const ISS_REFERENCE = [
  {
    utc: '2026-11-17T00:00:00Z',
    temeKm: [-4155.2411094350355, -2188.6521283551365, -4920.46547084565],
    temeVelKmS: [1.0685328752663334, -7.212592822770615, 2.314818049467138],
    itrsKm: [-4135.402490452949, 2225.909490174296, -4920.465470845648],
    heightKm: 435.08,
  },
  {
    utc: '2026-11-17T06:30:00Z',
    temeKm: [-564.4531948425247, -6757.121914758338, 401.03383244729986],
    temeVelKmS: [4.778622907307164, -0.033523190971706286, 5.994683603103835],
    itrsKm: [-2472.9559545246125, 6313.619629583069, 401.0338324472952],
    heightKm: 414.44,
  },
] as const

describe('ISS against an independent implementation (skyfield)', () => {
  const satrec = createSatrec(ISS)!

  it.each(ISS_REFERENCE)('$utc', (ref) => {
    const t = Date.parse(ref.utc)
    const state = propagateTeme(satrec, t)!
    for (let i = 0; i < 3; i++) {
      // Same SGP4 algorithm, so TEME agrees to metres.
      expect(Math.abs(state.rKm[i]! - ref.temeKm[i]!)).toBeLessThan(0.01)
      expect(Math.abs(state.vKmS[i]! - ref.temeVelKmS[i]!)).toBeLessThan(1e-5)
    }
    // Earth-fixed: our GMST uses UTC and skips polar motion; still well under 1 km.
    const ecf = propagateEcf(satrec, t)!
    const errKm = Math.hypot(
      ecf[0] - ref.itrsKm[0],
      ecf[1] - ref.itrsKm[1],
      ecf[2] - ref.itrsKm[2],
    )
    expect(errKm).toBeLessThan(1)
  })

  it('has plausible ISS altitude and speed', () => {
    const state = propagateTeme(satrec, Date.parse('2026-11-17T06:30:00Z'))!
    const alt = altitudeKm(state.rKm)
    // Spherical altitude differs from skyfield's WGS84 height by up to ~21 km
    // (Earth's flattening), so only check a plausible band here.
    expect(alt).toBeGreaterThan(390)
    expect(alt).toBeLessThan(450)
    expect(speedKmS(state.vKmS)).toBeCloseTo(7.66, 1)
  })
})

describe('invalid satellites', () => {
  it('rejects records SGP4 cannot initialise', () => {
    expect(createSatrec({ ...ISS, ECCENTRICITY: 1.5 })).toBeNull()
  })

  it('returns null instead of a position after decay', () => {
    // Very high drag: SGP4 reports this orbit as decayed within weeks.
    const satrec = createSatrec({ ...ISS, MEAN_MOTION: 16.4, BSTAR: 0.5 })!
    expect(satrec).not.toBeNull()
    const later = Date.parse(ISS.EPOCH + 'Z') + 60 * 86_400_000
    expect(propagateTeme(satrec, later)).toBeNull()
    expect(propagateEcf(satrec, later)).toBeNull()
  })
})

describe('orbit helpers', () => {
  it('derives period and semi-major axis from mean motion', () => {
    expect(periodMinutes(ISS.MEAN_MOTION)).toBeCloseTo(92.94, 2)
    // GEO: one sidereal day per revolution -> ~42,164 km.
    expect(semiMajorAxisKm(1.00273790935)).toBeCloseTo(42164, -1)
  })
})
