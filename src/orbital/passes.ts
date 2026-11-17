import { sgp4, type SatRec } from 'satellite.js'
import { DEG_TO_RAD, EARTH_RADIUS_KM, RAD_TO_DEG } from './constants'
import { temeToEcf } from './frames'
import { WGS84_F } from './geodetic'
import { sunDirectionEcf } from './sun'
import { gmstAt, minutesSinceEpoch } from './time'

export interface Observer {
  latDeg: number
  lonDeg: number
  heightKm: number
}

export interface Pass {
  /** Rise time (UTC ms). If the pass was already under way at the search start, that start time. */
  riseMs: number
  riseAzDeg: number
  peakMs: number
  peakElDeg: number
  peakAzDeg: number
  setMs: number
  setAzDeg: number
  /** Already above the horizon when the search started. */
  inProgress: boolean
  /** Satellite sunlit while the observer is in darkness (Sun below -6°) at the peak. */
  visible: boolean
}

export type PassResult =
  | { kind: 'passes'; passes: Pass[] }
  /** Above the horizon for the whole window (e.g. a geostationary satellite in view). */
  | { kind: 'always'; elevationDeg: number; azimuthDeg: number }
  /** Never above the horizon in the window. */
  | { kind: 'never' }

export interface PassOptions {
  /** Only report passes whose peak is at least this high. */
  minPeakDeg?: number
  /** Coarse scan step. Must be shorter than the shortest pass you care about. */
  stepMs?: number
}

/** Precomputed observer frame: Earth-fixed position and local east/north/up axes. */
class Station {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly east: [number, number, number]
  readonly north: [number, number, number]
  readonly up: [number, number, number]

  constructor(o: Observer) {
    const lat = o.latDeg * DEG_TO_RAD
    const lon = o.lonDeg * DEG_TO_RAD
    const sinLat = Math.sin(lat)
    const cosLat = Math.cos(lat)
    const sinLon = Math.sin(lon)
    const cosLon = Math.cos(lon)
    // WGS84 geodetic -> ECF.
    const e2 = WGS84_F * (2 - WGS84_F)
    const n = EARTH_RADIUS_KM / Math.sqrt(1 - e2 * sinLat * sinLat)
    this.x = (n + o.heightKm) * cosLat * cosLon
    this.y = (n + o.heightKm) * cosLat * sinLon
    this.z = (n * (1 - e2) + o.heightKm) * sinLat
    this.east = [-sinLon, cosLon, 0]
    this.north = [-sinLat * cosLon, -sinLat * sinLon, cosLat]
    this.up = [cosLat * cosLon, cosLat * sinLon, sinLat]
  }
}

const ecf = new Float64Array(3)
const sun = new Float64Array(3)
/** [elevationRad, azimuthRad] of the last lookAt() call. */
const look = new Float64Array(2)

/** Look angles from the station at time t. Returns false if SGP4 fails. */
function lookAt(satrec: SatRec, station: Station, t: number): boolean {
  const result = sgp4(satrec, minutesSinceEpoch(satrec.jdsatepoch, t))
  const r = result ? result.position : null
  if (!r || !Number.isFinite(r.x)) return false
  temeToEcf(r.x, r.y, r.z, gmstAt(t), ecf)
  const dx = ecf[0]! - station.x
  const dy = ecf[1]! - station.y
  const dz = ecf[2]! - station.z
  const range = Math.hypot(dx, dy, dz)
  const e = station.east[0] * dx + station.east[1] * dy
  const n = station.north[0] * dx + station.north[1] * dy + station.north[2] * dz
  const u = station.up[0] * dx + station.up[1] * dy + station.up[2] * dz
  look[0] = Math.asin(u / range)
  const az = Math.atan2(e, n)
  look[1] = az < 0 ? az + 2 * Math.PI : az
  return true
}

function elevation(satrec: SatRec, station: Station, t: number): number {
  return lookAt(satrec, station, t) ? look[0]! : Number.NaN
}

/** Bisection for the horizon crossing between a (below/above) and b (opposite). */
function crossing(satrec: SatRec, station: Station, a: number, b: number): number {
  const aboveAtA = elevation(satrec, station, a) > 0
  for (let i = 0; i < 16; i++) {
    const mid = (a + b) / 2
    if (elevation(satrec, station, mid) > 0 === aboveAtA) a = mid
    else b = mid
  }
  return (a + b) / 2
}

/** Golden-section search for the elevation maximum in [a, b]. */
function peak(satrec: SatRec, station: Station, a: number, b: number): number {
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  for (let i = 0; i < 40 && b - a > 50; i++) {
    if (elevation(satrec, station, c) > elevation(satrec, station, d)) b = d
    else a = c
    c = b - g * (b - a)
    d = a + g * (b - a)
  }
  return (a + b) / 2
}

/** Satellite sunlit (cylindrical Earth shadow) at the last lookAt() position. */
function satelliteSunlit(t: number): boolean {
  sunDirectionEcf(t, sun)
  const along = ecf[0]! * sun[0]! + ecf[1]! * sun[1]! + ecf[2]! * sun[2]!
  if (along >= 0) return true
  const r2 = ecf[0]! * ecf[0]! + ecf[1]! * ecf[1]! + ecf[2]! * ecf[2]!
  return r2 - along * along > EARTH_RADIUS_KM * EARTH_RADIUS_KM
}

/** Sun elevation (degrees) at the station. */
export function sunElevationDeg(station: Observer, t: number): number {
  const s = new Station(station)
  sunDirectionEcf(t, sun)
  return Math.asin(s.up[0] * sun[0]! + s.up[1] * sun[1]! + s.up[2] * sun[2]!) * RAD_TO_DEG
}

/**
 * Passes of one satellite over an observer in [startMs, startMs + durationMs].
 * Horizon is 0° (geometric, no refraction). Rise/set are found to well under a
 * second, the peak to ~50 ms.
 */
export function findPasses(
  satrec: SatRec,
  observer: Observer,
  startMs: number,
  durationMs: number,
  options: PassOptions = {},
): PassResult {
  const minPeakRad = (options.minPeakDeg ?? 10) * DEG_TO_RAD
  const step = options.stepMs ?? 30_000
  const station = new Station(observer)
  const endMs = startMs + durationMs

  const passes: Pass[] = []
  let prevT = startMs
  let prevEl = elevation(satrec, station, startMs)
  let riseT: number | null = prevEl > 0 ? startMs : null
  const startedAbove = prevEl > 0
  let everAbove = prevEl > 0
  let everBelow = !(prevEl > 0)

  for (let t = startMs + step; t <= endMs + step; t += step) {
    const tt = Math.min(t, endMs)
    const el = elevation(satrec, station, tt)
    if (Number.isNaN(el)) break // decayed: stop here
    if (el > 0) everAbove = true
    else everBelow = true

    if (prevEl <= 0 && el > 0) {
      riseT = crossing(satrec, station, prevT, tt)
    } else if (prevEl > 0 && el <= 0 && riseT !== null) {
      const setT = crossing(satrec, station, prevT, tt)
      pushPass(riseT, setT, riseT === startMs && startedAbove)
      riseT = null
    }
    prevT = tt
    prevEl = el
    if (tt >= endMs) break
  }

  if (everAbove && !everBelow) {
    lookAt(satrec, station, startMs)
    return { kind: 'always', elevationDeg: look[0]! * RAD_TO_DEG, azimuthDeg: look[1]! * RAD_TO_DEG }
  }
  if (!everAbove) return { kind: 'never' }
  return { kind: 'passes', passes }

  function pushPass(rise: number, set: number, inProgress: boolean): void {
    const peakT = peak(satrec, station, rise, set)
    lookAt(satrec, station, peakT)
    const peakEl = look[0]!
    if (peakEl < minPeakRad) return
    const peakAz = look[1]!
    const sunlit = satelliteSunlit(peakT)
    const dark = Math.asin(
      station.up[0] * sun[0]! + station.up[1] * sun[1]! + station.up[2] * sun[2]!,
    ) < -6 * DEG_TO_RAD
    lookAt(satrec, station, rise)
    const riseAz = look[1]!
    lookAt(satrec, station, set)
    const setAz = look[1]!
    passes.push({
      riseMs: rise,
      riseAzDeg: riseAz * RAD_TO_DEG,
      peakMs: peakT,
      peakElDeg: peakEl * RAD_TO_DEG,
      peakAzDeg: peakAz * RAD_TO_DEG,
      setMs: set,
      setAzDeg: setAz * RAD_TO_DEG,
      inProgress,
      visible: sunlit && dark,
    })
  }
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
/** Azimuth (degrees from north, clockwise) -> 8-point compass label. */
export function compassPoint(azDeg: number): string {
  return COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8]!
}
