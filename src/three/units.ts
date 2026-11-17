/**
 * The only place km are converted to scene units, and Earth-fixed (ECF)
 * axes are remapped to three.js axes.
 *
 * Scene units: 1 unit = 1 Earth equatorial radius.
 *
 * ECF: +x toward (lat 0, lon 0), +y toward (lat 0, lon 90E), +z toward the
 * North Pole. three.js is y-up, and SphereGeometry's default UVs put the
 * texture center (Greenwich) on +x and lon 90E on -z. So:
 *   scene.x =  ecf.x
 *   scene.y =  ecf.z
 *   scene.z = -ecf.y
 */
import { EARTH_RADIUS_KM } from '../orbital/constants'

export const KM_TO_SCENE = 1 / EARTH_RADIUS_KM

/** Write an ECF position (km) into `out` at `offset` as scene units. No allocation. */
export function ecfKmToScene(
  xKm: number,
  yKm: number,
  zKm: number,
  out: Float32Array | number[],
  offset = 0,
): void {
  out[offset] = xKm * KM_TO_SCENE
  out[offset + 1] = zKm * KM_TO_SCENE
  out[offset + 2] = -yKm * KM_TO_SCENE
}

/** Geodetic-ish (spherical) lat/lon in degrees to a scene position at `radius` scene units. */
export function latLonToScene(
  latDeg: number,
  lonDeg: number,
  radius: number,
  out: Float32Array | number[],
  offset = 0,
): void {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  const xKm = Math.cos(lat) * Math.cos(lon)
  const yKm = Math.cos(lat) * Math.sin(lon)
  const zKm = Math.sin(lat)
  const scale = radius * EARTH_RADIUS_KM
  ecfKmToScene(xKm * scale, yKm * scale, zKm * scale, out, offset)
}
