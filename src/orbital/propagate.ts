import { json2satrec, sgp4, type OMMJsonObject, type SatRec } from 'satellite.js'
import type { OmmRecord } from '../types/data-contract'
import { EARTH_RADIUS_KM, MINUTES_PER_DAY, MU_KM3_S2 } from './constants'
import { temeToEcf } from './frames'
import { gmstAt, minutesSinceEpoch } from './time'

export type { SatRec }

/** Build a satrec from an OMM record. Returns null for records SGP4 rejects. */
export function createSatrec(record: OmmRecord): SatRec | null {
  try {
    // The contract keeps CelesTrak's OMM field names, which json2satrec reads
    // directly. Our record type is looser on two enums, so cast at this boundary.
    const satrec = json2satrec(record as unknown as OMMJsonObject)
    return satrec.error === 0 ? satrec : null
  } catch {
    return null
  }
}

export interface StateVector {
  /** TEME position, km. */
  rKm: [number, number, number]
  /** TEME velocity, km/s. */
  vKmS: [number, number, number]
}

/**
 * SGP4 at a UTC time. Returns null when SGP4 fails (decayed, eccentricity out
 * of range...) or returns non-finite values. Callers must skip those satellites.
 */
export function propagateTeme(satrec: SatRec, utcMs: number): StateVector | null {
  const result = sgp4(satrec, minutesSinceEpoch(satrec.jdsatepoch, utcMs))
  if (!result) return null
  const { position: r, velocity: v } = result
  if (
    !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z) ||
    !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)
  ) {
    return null
  }
  return { rKm: [r.x, r.y, r.z], vKmS: [v.x, v.y, v.z] }
}

/**
 * Earth-fixed position (km) at a UTC time, written into out[offset..+2].
 * Returns false (and writes NaN) when propagation fails.
 * `gmstRad` is passed in so a batch at one time computes it once.
 */
export function propagateEcfInto(
  satrec: SatRec,
  utcMs: number,
  gmstRad: number,
  out: Float32Array | Float64Array | number[],
  offset = 0,
): boolean {
  const result = sgp4(satrec, minutesSinceEpoch(satrec.jdsatepoch, utcMs))
  const r = result ? result.position : null
  if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z)) {
    out[offset] = Number.NaN
    out[offset + 1] = Number.NaN
    out[offset + 2] = Number.NaN
    return false
  }
  temeToEcf(r.x, r.y, r.z, gmstRad, out, offset)
  return true
}

/** Convenience for one satellite: ECF km at a time, or null. */
export function propagateEcf(satrec: SatRec, utcMs: number): [number, number, number] | null {
  const out: [number, number, number] = [0, 0, 0]
  return propagateEcfInto(satrec, utcMs, gmstAt(utcMs), out) ? out : null
}

/** Altitude above the spherical Earth (EARTH_RADIUS_KM), km. */
export function altitudeKm(rKm: readonly [number, number, number]): number {
  return Math.hypot(rKm[0], rKm[1], rKm[2]) - EARTH_RADIUS_KM
}

/** Inertial speed, km/s. */
export function speedKmS(vKmS: readonly [number, number, number]): number {
  return Math.hypot(vKmS[0], vKmS[1], vKmS[2])
}

/** Orbital period from mean motion (rev/day), minutes. */
export function periodMinutes(meanMotionRevPerDay: number): number {
  return MINUTES_PER_DAY / meanMotionRevPerDay
}

/** Semi-major axis from mean motion (rev/day), km. Kepler's third law. */
export function semiMajorAxisKm(meanMotionRevPerDay: number): number {
  const nRadS = (meanMotionRevPerDay * 2 * Math.PI) / 86_400
  return Math.cbrt(MU_KM3_S2 / (nRadS * nRadS))
}
