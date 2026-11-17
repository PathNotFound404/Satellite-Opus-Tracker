import { sgp4, type SatRec } from 'satellite.js'
import { temeToEcf } from './frames'
import { ecfToGeodetic } from './geodetic'
import { gmstAt, minutesSinceEpoch } from './time'

const ecf = new Float64Array(3)
const geo = new Float64Array(3)

/**
 * Geodetic subpoints (lat, lon in radians) at `count` times starting at
 * `startMs`, `stepMs` apart, written as pairs into `out`. Each sample uses its
 * own GMST, so the track includes Earth's rotation.
 * Returns how many leading samples are valid; stops at the first SGP4 failure.
 */
export function sampleGroundTrack(
  satrec: SatRec,
  startMs: number,
  stepMs: number,
  count: number,
  out: Float64Array,
): number {
  for (let k = 0; k < count; k++) {
    const t = startMs + k * stepMs
    const result = sgp4(satrec, minutesSinceEpoch(satrec.jdsatepoch, t))
    const r = result ? result.position : null
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z)) return k
    temeToEcf(r.x, r.y, r.z, gmstAt(t), ecf)
    ecfToGeodetic(ecf[0]!, ecf[1]!, ecf[2]!, geo)
    out[k * 2] = geo[0]!
    out[k * 2 + 1] = geo[1]!
  }
  return count
}
