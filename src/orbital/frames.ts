/**
 * TEME -> Earth-fixed (ECF / pseudo-Earth-fixed) rotation.
 *
 * SGP4 outputs positions in TEME. Rotating by GMST about the z axis gives
 * Earth-fixed coordinates. Polar motion (a few metres) is ignored, which is far
 * below SGP4's accuracy. This is the single place the conversion happens.
 */

/** Writes ECF (same units as the input) into out[offset..offset+2]. No allocation. */
export function temeToEcf(
  x: number,
  y: number,
  z: number,
  gmstRad: number,
  out: Float32Array | Float64Array | number[],
  offset = 0,
): void {
  const c = Math.cos(gmstRad)
  const s = Math.sin(gmstRad)
  out[offset] = c * x + s * y
  out[offset + 1] = -s * x + c * y
  out[offset + 2] = z
}

/**
 * TEME velocity -> Earth-fixed velocity (km/s), including the ω × r term
 * for Earth's rotation. Used for ground speed; inertial speed uses the TEME
 * velocity directly.
 */
export const EARTH_ROTATION_RAD_S = 7.292115146706979e-5

export function temeVelocityToEcf(
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  vz: number,
  gmstRad: number,
  out: Float32Array | Float64Array | number[],
  offset = 0,
): void {
  const c = Math.cos(gmstRad)
  const s = Math.sin(gmstRad)
  // Rotate r and v into ECF, then subtract ω × r_ecf.
  const rxe = c * rx + s * ry
  const rye = -s * rx + c * ry
  out[offset] = c * vx + s * vy + EARTH_ROTATION_RAD_S * rye
  out[offset + 1] = -s * vx + c * vy - EARTH_ROTATION_RAD_S * rxe
  out[offset + 2] = vz
}
