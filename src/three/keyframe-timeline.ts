/**
 * Schedules propagation keyframes and says how far between two of them the
 * simulation is. Rendering interpolates between `prev` and `next`; a third
 * buffer is filled in the background so it's ready before `next` runs out.
 *
 * Pure logic: the actual propagation is done by whoever handles `request`.
 * No allocation after construction (three buffers rotate).
 */

/** Wall-clock spacing between keyframes. 1 s keeps linear interpolation error ~1 m for LEO. */
export const KEYFRAME_WALL_MS = 1000
/**
 * Upper bound on keyframe spacing in simulation time, for fast time rates.
 * At 60 s, linear interpolation is off by ~4 km for LEO: sub-pixel at normal
 * zoom, and it keeps 1000x to ~17 keyframes per second (ADR 0002).
 */
export const MAX_KEYFRAME_SIM_MS = 60_000

/** `advance()` results that aren't an interpolation factor. */
export const NOT_READY = -1
export const NEEDS_RESET = -2

export interface Keyframe {
  buffer: Float32Array
  timeMs: number
}

type Slot = { buffer: Float32Array; timeMs: number; state: 'free' | 'pending' | 'ready'; id: number }

export class KeyframeTimeline {
  private readonly slots: Slot[]
  private prev: Slot | null = null
  private next: Slot | null = null
  private nextId = 1
  /** Bumped on reset, so stale replies are ignored. */
  private generation = 0
  private readonly idGeneration = new Map<number, number>()

  constructor(
    floatsPerKeyframe: number,
    private readonly request: (id: number, timeMs: number, buffer: Float32Array) => void,
  ) {
    this.slots = [0, 1, 2].map(() => ({
      buffer: new Float32Array(floatsPerKeyframe),
      timeMs: 0,
      state: 'free' as const,
      id: 0,
    }))
  }

  /** Simulation-time spacing for the current rate. */
  static spacingMs(rate: number): number {
    return Math.min(MAX_KEYFRAME_SIM_MS, Math.max(KEYFRAME_WALL_MS, KEYFRAME_WALL_MS * Math.abs(rate)))
  }

  /**
   * Throw away everything and start again around `simMs` (time jumped or the
   * rate changed). `leadMs` (wall time) starts the new pair ahead of the
   * clock so it is still current when the worker returns it.
   */
  reset(simMs: number, rate: number, leadMs = 0): void {
    this.generation++
    for (const s of this.slots) {
      // A pending slot's buffer is inside the worker; it comes back via receive().
      if (s.state === 'ready') s.state = 'free'
    }
    this.prev = null
    this.next = null
    const step = KeyframeTimeline.spacingMs(rate) * Math.sign(rate || 1)
    const start = simMs + leadMs * rate
    this.requestAt(start)
    this.requestAt(start + step)
  }

  /**
   * A finished keyframe is back. The buffer may be a new object (it was
   * transferred), so it replaces the slot's buffer.
   */
  receive(id: number, timeMs: number, buffer: Float32Array): void {
    const slot = this.slots.find((s) => s.state === 'pending' && s.id === id)
    if (!slot) return
    slot.buffer = buffer
    if (this.idGeneration.get(id) !== this.generation) {
      slot.state = 'free'
      this.idGeneration.delete(id)
      return
    }
    this.idGeneration.delete(id)
    slot.timeMs = timeMs
    slot.state = 'ready'
  }

  /**
   * Advance to `simMs`. Returns the interpolation factor between prev and
   * next (0..1), NOT_READY while the first pair is still being computed, or
   * NEEDS_RESET when sim time has left the keyframe window.
   */
  advance(simMs: number, rate: number): number {
    this.promote(simMs, rate)
    if (!this.prev || !this.next) {
      this.fillInitialPair(simMs, rate)
      return NOT_READY
    }

    const span = this.next.timeMs - this.prev.timeMs
    const t = span === 0 ? 0 : (simMs - this.prev.timeMs) / span
    // Way outside the window (a jump the clock didn't announce): start over.
    if (t < -1 || t > 3) return NEEDS_RESET

    // Keep one keyframe in flight ahead of `next`, spaced for the current rate.
    if (t > 0.25 && !this.hasPending()) {
      this.requestAt(this.next.timeMs + KeyframeTimeline.spacingMs(rate) * Math.sign(rate || 1))
    }
    return Math.min(1, Math.max(0, t))
  }

  get prevKeyframe(): Keyframe | null {
    return this.prev
  }

  get nextKeyframe(): Keyframe | null {
    return this.next
  }

  // Runs every frame: plain loops, no closures or temporary arrays.
  private hasPending(): boolean {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i]!.state === 'pending') return true
    return false
  }

  private promote(simMs: number, rate: number): void {
    if (!this.prev || !this.next) {
      // Initial fill (only until the first pair exists): the two earliest
      // ready slots, in time order.
      const all = this.slots
        .filter((s) => s.state === 'ready')
        .sort((a, b) => (a.timeMs - b.timeMs) * Math.sign(rate || 1))
      if (all.length >= 2) {
        this.prev = all[0]!
        this.next = all[1]!
      }
      return
    }
    // Shift forward once sim time has passed `next` and the following keyframe is ready.
    const passedNext = rate >= 0 ? simMs >= this.next.timeMs : simMs <= this.next.timeMs
    if (!passedNext) return
    let upcoming: Slot | null = null
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!
      if (s.state === 'ready' && s !== this.prev && s !== this.next) upcoming = s
    }
    if (upcoming) {
      this.prev.state = 'free'
      this.prev = this.next
      this.next = upcoming
    }
  }

  /**
   * After a reset, slots still held by the worker for stale requests may have
   * blocked one of the two initial requests. Ask again once they're free.
   */
  private fillInitialPair(simMs: number, rate: number): void {
    const live = this.slots.filter(
      (s) => s.state === 'ready' || (s.state === 'pending' && this.idGeneration.get(s.id) === this.generation),
    )
    if (live.length >= 2) return
    const step = KeyframeTimeline.spacingMs(rate) * Math.sign(rate || 1)
    if (live.length === 0) {
      this.requestAt(simMs)
      this.requestAt(simMs + step)
    } else {
      this.requestAt(live[0]!.timeMs + step)
    }
  }

  private requestAt(timeMs: number): void {
    const slot = this.slots.find((s) => s.state === 'free')
    if (!slot) return
    const id = this.nextId++
    slot.state = 'pending'
    slot.id = id
    slot.timeMs = timeMs
    this.idGeneration.set(id, this.generation)
    this.request(id, timeMs, slot.buffer)
  }
}
