import { sgp4, type SatRec } from 'satellite.js'
import { EARTH_RADIUS_KM, MU_KM3_S2 } from './constants'
import { semiMajorAxisKm } from './propagate'
import { minutesSinceEpoch } from './time'

export interface Conjunction {
  /** Index of the other satellite in the catalogue. */
  index: number
  /** Time of closest approach, UTC ms. */
  tcaMs: number
  missKm: number
  relativeSpeedKmS: number
}

export interface ScreeningTarget {
  index: number
  satrec: SatRec
  meanMotionRevPerDay: number
  eccentricity: number
}

export interface ScreeningOptions {
  thresholdKm: number
  /** Coarse step. Distance minima are found from range-rate sign changes, so this only needs to be short relative to the orbit. */
  stepMs?: number
  /** Extra room on the altitude-band prefilter for drag and short-period terms. */
  bandMarginKm?: number
  onProgress?: (fraction: number) => void
}

/**
 * Pairs this close moving this slowly relative to each other are docked or
 * flying in formation (e.g. a Soyuz on the ISS, whose element set differs
 * slightly from the station's), not a conjunction.
 */
const COLOCATED_KM = 5
const COLOCATED_SPEED_KMS = 0.02
/** Fine steps per coarse window. */
const COARSE_FACTOR = 5

/** Fastest speed on the orbit (at perigee), km/s. Vis-viva. */
export function maxSpeedKmS(meanMotionRevPerDay: number, eccentricity: number): number {
  const a = semiMajorAxisKm(meanMotionRevPerDay)
  return Math.sqrt((MU_KM3_S2 * (1 + eccentricity)) / (a * (1 - eccentricity)))
}

/** Perigee and apogee altitudes (km) from mean elements. */
export function altitudeBand(meanMotionRevPerDay: number, eccentricity: number): [number, number] {
  const a = semiMajorAxisKm(meanMotionRevPerDay)
  return [a * (1 - eccentricity) - EARTH_RADIUS_KM, a * (1 + eccentricity) - EARTH_RADIUS_KM]
}

const state = new Float64Array(6)
function stateAt(satrec: SatRec, t: number, out: Float64Array, offset = 0): boolean {
  const result = sgp4(satrec, minutesSinceEpoch(satrec.jdsatepoch, t))
  if (!result) return false
  const { position: r, velocity: v } = result
  if (!Number.isFinite(r.x) || !Number.isFinite(v.x)) return false
  out[offset] = r.x
  out[offset + 1] = r.y
  out[offset + 2] = r.z
  out[offset + 3] = v.x
  out[offset + 4] = v.y
  out[offset + 5] = v.z
  return true
}

const a6 = new Float64Array(6)
const b6 = new Float64Array(6)
function distanceAt(primary: SatRec, other: SatRec, t: number): number {
  if (!stateAt(primary, t, a6) || !stateAt(other, t, b6)) return Infinity
  return Math.hypot(a6[0]! - b6[0]!, a6[1]! - b6[1]!, a6[2]! - b6[2]!)
}

/**
 * Close approaches between `primary` and each target in
 * [startMs, startMs + durationMs], closer than `thresholdKm`.
 *
 * Method: (1) skip targets whose perigee-apogee band can't come within the
 * threshold of the primary's; (2) sample every COARSE_FACTOR steps: the pair
 * can't close faster than the sum of their perigee speeds, so a sample far
 * enough apart rules out its whole window; (3) in windows not ruled out, step
 * finely and find every local minimum of distance as a sign change of the
 * range rate (r.v); (4) estimate that minimum from linear relative motion,
 * and refine the promising ones with a golden-section search.
 * Distances are frame-independent, so TEME is used throughout.
 */
export function screenConjunctions(
  primary: SatRec,
  primaryElements: { meanMotionRevPerDay: number; eccentricity: number },
  targets: readonly ScreeningTarget[],
  startMs: number,
  durationMs: number,
  options: ScreeningOptions,
): Conjunction[] {
  const step = options.stepMs ?? 60_000
  const margin = options.bandMarginKm ?? 50
  const threshold = options.thresholdKm
  const steps = Math.ceil(durationMs / step)

  // Primary states at every step, computed once.
  const primaryStates = new Float64Array((steps + 1) * 6)
  const primaryOk = new Uint8Array(steps + 1)
  for (let k = 0; k <= steps; k++) primaryOk[k] = stateAt(primary, startMs + k * step, primaryStates, k * 6) ? 1 : 0

  const [pLow, pHigh] = altitudeBand(primaryElements.meanMotionRevPerDay, primaryElements.eccentricity)
  const primarySpeed = maxSpeedKmS(primaryElements.meanMotionRevPerDay, primaryElements.eccentricity)
  const found: Conjunction[] = []
  const coarseCount = Math.floor(steps / COARSE_FACTOR) + 1
  const cleared = new Uint8Array(coarseCount)
  /** Half a coarse window, seconds. */
  const halfWindowS = ((COARSE_FACTOR / 2) * step) / 1000
  const windowOf = (k: number) => Math.min(coarseCount - 1, Math.round(k / COARSE_FACTOR))

  for (let n = 0; n < targets.length; n++) {
    if (options.onProgress && n % 200 === 0) options.onProgress(n / targets.length)
    const target = targets[n]!
    if (target.satrec === primary) continue
    const [low, high] = altitudeBand(target.meanMotionRevPerDay, target.eccentricity)
    if (low > pHigh + threshold + margin || high < pLow - threshold - margin) continue

    // Coarse pass: rule out windows where the pair is too far apart to meet.
    const closing = primarySpeed + maxSpeedKmS(target.meanMotionRevPerDay, target.eccentricity)
    const clearDistance = threshold + 20 + closing * halfWindowS
    for (let c = 0; c < coarseCount; c++) {
      const k = c * COARSE_FACTOR
      cleared[c] = 0
      if (!primaryOk[k] || !stateAt(target.satrec, startMs + k * step, state)) continue
      const o = k * 6
      const dist = Math.hypot(
        state[0]! - primaryStates[o]!,
        state[1]! - primaryStates[o + 1]!,
        state[2]! - primaryStates[o + 2]!,
      )
      if (dist > clearDistance) cleared[c] = 1
    }

    let prevRr = Number.NaN
    let prevDx = 0, prevDy = 0, prevDz = 0, prevVx = 0, prevVy = 0, prevVz = 0
    for (let k = 0; k <= steps; k++) {
      const t = startMs + k * step
      // Fine samples are needed inside uncleared windows and one step either
      // side, so a minimum straddling a window edge is still bracketed.
      const needed =
        !cleared[windowOf(k)] ||
        (k > 0 && !cleared[windowOf(k - 1)]) ||
        (k < steps && !cleared[windowOf(k + 1)])
      if (!needed || !primaryOk[k] || !stateAt(target.satrec, t, state)) {
        prevRr = Number.NaN
        continue
      }
      const o = k * 6
      const dx = state[0]! - primaryStates[o]!
      const dy = state[1]! - primaryStates[o + 1]!
      const dz = state[2]! - primaryStates[o + 2]!
      const vx = state[3]! - primaryStates[o + 3]!
      const vy = state[4]! - primaryStates[o + 4]!
      const vz = state[5]! - primaryStates[o + 5]!
      const rr = dx * vx + dy * vy + dz * vz

      // Closing at the previous sample, opening now: a distance minimum in between.
      if (prevRr < 0 && rr >= 0) {
        // Linear relative motion from the previous sample.
        const vv = prevVx * prevVx + prevVy * prevVy + prevVz * prevVz
        const tau = vv > 0 ? Math.min(step / 1000, Math.max(0, -prevRr / vv)) : 0
        const estimate = Math.hypot(prevDx + prevVx * tau, prevDy + prevVy * tau, prevDz + prevVz * tau)
        if (estimate < threshold + 20) {
          const hit = refine(primary, target, t - step, t)
          if (hit && hit.missKm < threshold) found.push(hit)
        }
      }
      prevRr = rr
      prevDx = dx; prevDy = dy; prevDz = dz
      prevVx = vx; prevVy = vy; prevVz = vz
    }
  }
  options.onProgress?.(1)
  return found.sort((a, b) => a.tcaMs - b.tcaMs)
}

/** Golden-section search for the time of closest approach in [a, b]. */
function refine(primary: SatRec, target: ScreeningTarget, a: number, b: number): Conjunction | null {
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = distanceAt(primary, target.satrec, c)
  let fd = distanceAt(primary, target.satrec, d)
  for (let i = 0; i < 40 && b - a > 5; i++) {
    if (fc < fd) {
      b = d; d = c; fd = fc
      c = b - g * (b - a)
      fc = distanceAt(primary, target.satrec, c)
    } else {
      a = c; c = d; fc = fd
      d = a + g * (b - a)
      fd = distanceAt(primary, target.satrec, d)
    }
  }
  const tca = (a + b) / 2
  if (!stateAt(primary, tca, a6) || !stateAt(target.satrec, tca, b6)) return null
  const miss = Math.hypot(a6[0]! - b6[0]!, a6[1]! - b6[1]!, a6[2]! - b6[2]!)
  const speed = Math.hypot(a6[3]! - b6[3]!, a6[4]! - b6[4]!, a6[5]! - b6[5]!)
  if (miss < COLOCATED_KM && speed < COLOCATED_SPEED_KMS) return null
  return { index: target.index, tcaMs: tca, missKm: miss, relativeSpeedKmS: speed }
}

/**
 * Brute-force reference: distance at every `stepMs` and local minima below
 * the threshold. Slow; for tests only.
 */
export function bruteForceConjunctions(
  primary: SatRec,
  targets: readonly ScreeningTarget[],
  startMs: number,
  durationMs: number,
  thresholdKm: number,
  stepMs = 1000,
): { index: number; tcaMs: number; missKm: number }[] {
  const out: { index: number; tcaMs: number; missKm: number }[] = []
  for (const target of targets) {
    if (target.satrec === primary) continue
    let d0 = Infinity
    let d1 = distanceAt(primary, target.satrec, startMs)
    for (let t = startMs + stepMs; t <= startMs + durationMs; t += stepMs) {
      const d2 = distanceAt(primary, target.satrec, t)
      if (d1 < d0 && d1 <= d2 && d1 < thresholdKm) out.push({ index: target.index, tcaMs: t - stepMs, missKm: d1 })
      d0 = d1
      d1 = d2
    }
  }
  return out.sort((a, b) => a.tcaMs - b.tcaMs)
}
