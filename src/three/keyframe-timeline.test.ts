import { describe, expect, it } from 'vitest'
import { KeyframeTimeline, MAX_KEYFRAME_SIM_MS, NEEDS_RESET, NOT_READY } from './keyframe-timeline'

/** Fake worker: records requests and answers them on demand. */
function setup() {
  const requests: { id: number; timeMs: number; buffer: Float32Array }[] = []
  const timeline = new KeyframeTimeline(4, (id, timeMs, buffer) => requests.push({ id, timeMs, buffer }))
  const answerAll = () => {
    while (requests.length) {
      const r = requests.shift()!
      r.buffer[0] = r.timeMs // tag the buffer with its time
      timeline.receive(r.id, r.timeMs, r.buffer)
    }
  }
  return { timeline, requests, answerAll }
}

describe('KeyframeTimeline', () => {
  it('requests two keyframes on reset and draws nothing until both arrive', () => {
    const { timeline, requests, answerAll } = setup()
    timeline.reset(10_000, 1)
    expect(requests.map((r) => r.timeMs)).toEqual([10_000, 11_000])
    expect(timeline.advance(10_000, 1)).toBe(NOT_READY)
    answerAll()
    expect(timeline.advance(10_500, 1)).toBeCloseTo(0.5)
    expect(timeline.prevKeyframe!.buffer[0]).toBe(10_000)
    expect(timeline.nextKeyframe!.buffer[0]).toBe(11_000)
  })

  it('prefetches the following keyframe and shifts when time passes next', () => {
    const { timeline, requests, answerAll } = setup()
    timeline.reset(0, 1)
    answerAll()
    timeline.advance(500, 1)
    expect(requests.map((r) => r.timeMs)).toEqual([2000])
    answerAll()
    expect(timeline.advance(1500, 1)).toBeCloseTo(0.5)
    expect(timeline.prevKeyframe!.timeMs).toBe(1000)
    expect(timeline.nextKeyframe!.timeMs).toBe(2000)
  })

  it('holds at the last keyframe if the next one is late', () => {
    const { timeline, answerAll } = setup()
    timeline.reset(0, 1)
    answerAll()
    timeline.advance(500, 1) // requests 2000, not answered
    expect(timeline.advance(1200, 1)).toBe(1)
    expect(timeline.nextKeyframe!.timeMs).toBe(1000)
  })

  it('asks for a reset after a large unannounced jump', () => {
    const { timeline, answerAll } = setup()
    timeline.reset(0, 1)
    answerAll()
    expect(timeline.advance(60_000, 1)).toBe(NEEDS_RESET)
  })

  it('ignores replies from before a reset and still fills the new pair', () => {
    const { timeline, requests, answerAll } = setup()
    timeline.reset(0, 1)
    const stale = requests.splice(0)
    // Only one slot is free, so only one new request can go out now.
    timeline.reset(50_000, 1)
    expect(requests.map((r) => r.timeMs)).toEqual([50_000])
    for (const r of stale) timeline.receive(r.id, r.timeMs, r.buffer)
    answerAll()
    // The stale replies freed their slots; the missing keyframe is requested now.
    expect(timeline.advance(50_000, 1)).toBe(NOT_READY)
    expect(requests.map((r) => r.timeMs)).toEqual([51_000])
    answerAll()
    expect(timeline.advance(50_250, 1)).toBeCloseTo(0.25)
    expect(timeline.prevKeyframe!.timeMs).toBe(50_000)
    expect(timeline.nextKeyframe!.timeMs).toBe(51_000)
  })

  it('widens spacing at higher rates, up to a cap', () => {
    expect(KeyframeTimeline.spacingMs(1)).toBe(1000)
    expect(KeyframeTimeline.spacingMs(10)).toBe(10_000)
    expect(KeyframeTimeline.spacingMs(-10)).toBe(10_000)
    expect(KeyframeTimeline.spacingMs(1000)).toBe(MAX_KEYFRAME_SIM_MS)
  })

  it('runs backwards for negative rates', () => {
    const { timeline, requests, answerAll } = setup()
    timeline.reset(100_000, -10)
    expect(requests.map((r) => r.timeMs)).toEqual([100_000, 90_000])
    answerAll()
    expect(timeline.advance(95_000, -10)).toBeCloseTo(0.5)
    expect(requests.map((r) => r.timeMs)).toEqual([80_000])
    answerAll()
    expect(timeline.advance(85_000, -10)).toBeCloseTo(0.5)
    expect(timeline.prevKeyframe!.timeMs).toBe(90_000)
  })

  it('starts the new pair ahead of the clock by the lead time', () => {
    const { timeline, requests } = setup()
    timeline.reset(0, 100, 50)
    expect(requests.map((r) => r.timeMs)).toEqual([5000, 65_000])
  })
})
