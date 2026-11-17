import { describe, expect, it } from 'vitest'
import { occludedByEarth } from './picking'

describe('occludedByEarth', () => {
  const cam = [0, 0, 5] as const

  it('sees a satellite on the near side', () => {
    expect(occludedByEarth(...cam, 0, 0, 1.06)).toBe(false)
  })

  it('hides a satellite directly behind the Earth', () => {
    expect(occludedByEarth(...cam, 0, 0, -1.06)).toBe(true)
  })

  it('sees a satellite beside the Earth even if it is farther away', () => {
    expect(occludedByEarth(...cam, 1.5, 0, -1)).toBe(false)
  })

  it('treats the far side of a high orbit as hidden only when the Earth is in the way', () => {
    expect(occludedByEarth(...cam, 0.5, 0, -6)).toBe(true)
    expect(occludedByEarth(...cam, 3, 0, -6)).toBe(false)
  })
})
