import { describe, expect, it } from 'vitest'
import { EARTH_RADIUS_KM } from '../orbital/constants'
import { ecfKmToScene, KM_TO_SCENE, latLonToScene, sceneToEcfKm } from './units'

describe('ecfKmToScene', () => {
  it('maps one Earth radius to one scene unit', () => {
    expect(EARTH_RADIUS_KM * KM_TO_SCENE).toBeCloseTo(1, 12)
  })

  it('remaps ECF axes to three.js y-up axes', () => {
    const out = [0, 0, 0]
    ecfKmToScene(EARTH_RADIUS_KM, 0, 0, out)
    expect(out).toEqual([1, 0, -0])

    ecfKmToScene(0, EARTH_RADIUS_KM, 0, out)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
    expect(out[2]).toBeCloseTo(-1, 12)

    ecfKmToScene(0, 0, EARTH_RADIUS_KM, out)
    expect(out[1]).toBeCloseTo(1, 12)
  })

  it('writes at an offset into a typed array', () => {
    const buf = new Float32Array(6)
    ecfKmToScene(EARTH_RADIUS_KM * 2, 0, 0, buf, 3)
    expect(Array.from(buf)).toEqual([0, 0, 0, 2, 0, -0])
  })
})

describe('latLonToScene', () => {
  // These match three.js SphereGeometry's default UVs, where the texture
  // center (Greenwich) sits on +x and lon 90E sits on -z.
  it('puts Greenwich on the equator at +x', () => {
    const out = [0, 0, 0]
    latLonToScene(0, 0, 1, out)
    expect(out[0]).toBeCloseTo(1, 12)
    expect(out[1]).toBeCloseTo(0, 12)
    expect(out[2]).toBeCloseTo(0, 12)
  })

  it('puts lon 90E at -z and the North Pole at +y', () => {
    const out = [0, 0, 0]
    latLonToScene(0, 90, 1, out)
    expect(out[2]).toBeCloseTo(-1, 12)
    latLonToScene(90, 0, 1, out)
    expect(out[1]).toBeCloseTo(1, 12)
  })
})

describe('sceneToEcfKm', () => {
  it('inverts ecfKmToScene', () => {
    const scene = [0, 0, 0]
    const back = [0, 0, 0]
    ecfKmToScene(1234, -5678, 3456, scene)
    sceneToEcfKm(scene[0]!, scene[1]!, scene[2]!, back)
    expect(back[0]).toBeCloseTo(1234, 9)
    expect(back[1]).toBeCloseTo(-5678, 9)
    expect(back[2]).toBeCloseTo(3456, 9)
  })
})
