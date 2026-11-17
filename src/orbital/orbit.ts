import type { SatRec } from 'satellite.js'
import { sgp4 } from 'satellite.js'
import { minutesSinceEpoch } from './time'

/**
 * Samples one orbital period of TEME positions (km), centred on `centerMs`,
 * into `out` (3 floats per sample). Sample `floor(count / 2)` is exactly the
 * position at `centerMs`, so a line through these points passes through the
 * satellite.
 *
 * Returns the number of valid samples written contiguously from the start.
 * Failed samples (decay mid-orbit) are skipped, so the line simply ends.
 */
export function sampleOrbitTeme(
  satrec: SatRec,
  centerMs: number,
  periodMin: number,
  count: number,
  out: Float32Array,
): number {
  const half = Math.floor(count / 2)
  const stepMin = periodMin / (count - 1)
  const centerMin = minutesSinceEpoch(satrec.jdsatepoch, centerMs)
  let written = 0
  for (let k = 0; k < count; k++) {
    const result = sgp4(satrec, centerMin + (k - half) * stepMin)
    const r = result ? result.position : null
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z)) continue
    out[written * 3] = r.x
    out[written * 3 + 1] = r.y
    out[written * 3 + 2] = r.z
    written++
  }
  return written
}
