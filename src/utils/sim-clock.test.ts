import { describe, expect, it } from 'vitest'
import { SimClock } from './sim-clock'

function fakeWall(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('SimClock', () => {
  it('runs at real time by default', () => {
    const wall = fakeWall()
    const clock = new SimClock(wall.now)
    const start = clock.now()
    wall.advance(1500)
    expect(clock.now() - start).toBe(1500)
  })

  it('scales by rate without jumping when the rate changes', () => {
    const wall = fakeWall()
    const clock = new SimClock(wall.now)
    wall.advance(1000)
    const before = clock.now()
    clock.setRate(60)
    expect(clock.now()).toBe(before)
    wall.advance(1000)
    expect(clock.now() - before).toBe(60_000)
  })

  it('pauses and resumes in place', () => {
    const wall = fakeWall()
    const clock = new SimClock(wall.now)
    clock.setPaused(true)
    const frozen = clock.now()
    wall.advance(5000)
    expect(clock.now()).toBe(frozen)
    clock.setPaused(false)
    wall.advance(100)
    expect(clock.now()).toBe(frozen + 100)
  })

  it('bumps epoch on jumps only', () => {
    const wall = fakeWall()
    const clock = new SimClock(wall.now)
    clock.setRate(10)
    expect(clock.epoch).toBe(0)
    clock.jumpTo(42)
    expect(clock.epoch).toBe(1)
    expect(clock.now()).toBe(42)
  })
})
