import { EARTH_RADIUS_KM } from './constants'

/** WGS84 flattening and first eccentricity squared. */
export const WGS84_F = 1 / 298.257223563
const E2 = WGS84_F * (2 - WGS84_F)

/**
 * Earth-fixed position (km) -> WGS84 geodetic latitude (rad), longitude (rad)
 * and height (km), written into out[0..2]. Iterative (converges to <1e-12 rad
 * in a few steps for any orbit). No allocation.
 */
export function ecfToGeodetic(
  xKm: number,
  yKm: number,
  zKm: number,
  out: Float64Array | number[],
): void {
  const a = EARTH_RADIUS_KM
  const p = Math.hypot(xKm, yKm)
  const lon = Math.atan2(yKm, xKm)
  // On the polar axis, height = |z| - polar radius (the general formula divides by cos(lat) = 0).
  if (p < 1e-9) {
    out[0] = zKm >= 0 ? Math.PI / 2 : -Math.PI / 2
    out[1] = lon
    out[2] = Math.abs(zKm) - a * (1 - WGS84_F)
    return
  }
  let lat = Math.atan2(zKm, p * (1 - E2))
  let height = 0
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat)
    const n = a / Math.sqrt(1 - E2 * sinLat * sinLat)
    height = p / Math.cos(lat) - n
    lat = Math.atan2(zKm, p * (1 - (E2 * n) / (n + height)))
  }
  out[0] = lat
  out[1] = lon
  out[2] = height
}
