import { eciToGeodetic } from 'satellite.js'
import { describe, expect, it } from 'vitest'
import { RAD_TO_DEG } from './constants'
import { ecfToGeodetic } from './geodetic'

/**
 * ISS Earth-fixed positions and WGS84 subpoints from Python skyfield 1.55
 * (see propagate.test.ts for how the positions were produced).
 */
const REFERENCE = [
  { itrsKm: [-4135.402490452949, 2225.909490174296, -4920.465470845648], lat: -46.514566078960506, lon: 151.70832843878716, heightKm: 435.0781253341659 },
  { itrsKm: [-2472.9559545246125, 6313.619629583069, 401.0338324472952], lat: 3.4061081115136753, lon: 111.38957956477047, heightKm: 414.4434716832374 },
] as const

describe('ecfToGeodetic', () => {
  it.each(REFERENCE)('matches skyfield wgs84 at lat $lat', (ref) => {
    const out = [0, 0, 0]
    ecfToGeodetic(ref.itrsKm[0], ref.itrsKm[1], ref.itrsKm[2], out)
    expect(Math.abs(out[0]! * RAD_TO_DEG - ref.lat)).toBeLessThan(0.01)
    expect(Math.abs(out[1]! * RAD_TO_DEG - ref.lon)).toBeLessThan(0.01)
    expect(Math.abs(out[2]! - ref.heightKm)).toBeLessThan(0.1)
  })

  it('agrees with satellite.js eciToGeodetic at GMST 0', () => {
    const r = { x: 1234, y: -5678, z: 3456 }
    const ref = eciToGeodetic(r, 0)
    const out = [0, 0, 0]
    ecfToGeodetic(r.x, r.y, r.z, out)
    expect(out[0]).toBeCloseTo(ref.latitude, 9)
    expect(out[1]).toBeCloseTo(ref.longitude, 9)
    expect(out[2]).toBeCloseTo(ref.height, 6)
  })

  it('handles the poles and the equator', () => {
    const out = [0, 0, 0]
    ecfToGeodetic(0, 0, 7000, out)
    expect(out[0]! * RAD_TO_DEG).toBeCloseTo(90, 6)
    ecfToGeodetic(7000, 0, 0, out)
    expect(out[0]).toBeCloseTo(0, 12)
    expect(out[2]).toBeCloseTo(7000 - 6378.137, 6)
  })
})
