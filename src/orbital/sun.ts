import { DEG_TO_RAD, RAD_TO_DEG } from './constants'
import { temeToEcf } from './frames'
import { gmstAt, msToJulian } from './time'

/**
 * Unit vector from Earth's centre toward the Sun, Earth-fixed (ECF), written
 * into out[0..2]. No allocation, so it can run every frame.
 *
 * Low-precision solar position from the Astronomical Almanac (good to about
 * 0.01° for 1950–2050), giving a mean-of-date equatorial direction, then the
 * same GMST rotation used for satellites. The small frame differences are far
 * below what shading can show.
 */
export function sunDirectionEcf(utcMs: number, out: Float32Array | Float64Array | number[]): void {
  const n = msToJulian(utcMs) - 2451545.0
  const meanLongitude = (280.46 + 0.9856474 * n) * DEG_TO_RAD
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG_TO_RAD
  const eclipticLongitude =
    meanLongitude + (1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG_TO_RAD
  const obliquity = (23.439 - 0.0000004 * n) * DEG_TO_RAD
  const x = Math.cos(eclipticLongitude)
  const y = Math.cos(obliquity) * Math.sin(eclipticLongitude)
  const z = Math.sin(obliquity) * Math.sin(eclipticLongitude)
  // (x, y, z) is already a unit vector; the rotation preserves length.
  temeToEcf(x, y, z, gmstAt(utcMs), out)
}

/** Geocentric latitude/longitude (degrees) of the subsolar point. */
export function subsolarPoint(utcMs: number): { latDeg: number; lonDeg: number } {
  const d = [0, 0, 0]
  sunDirectionEcf(utcMs, d)
  return {
    latDeg: Math.asin(d[2]!) * RAD_TO_DEG,
    lonDeg: Math.atan2(d[1]!, d[0]!) * RAD_TO_DEG,
  }
}
