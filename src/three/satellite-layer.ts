import type { OmmRecord } from '../types/data-contract'
import type { SimClock } from '../utils/sim-clock'
import { KEYFRAME_STRIDE, type FromWorker, type ToWorker } from '../workers/propagation-protocol'
import { KeyframeTimeline, NEEDS_RESET, NOT_READY } from './keyframe-timeline'
import { SatellitePoints } from './satellite-points'
import type { SceneController } from './scene'

export interface PropagationStats {
  satellites: number
  /** Satellites SGP4 rejected at init or failed to propagate at the last keyframe. */
  invalid: number
  lastPropagateMs: number
  initMs: number
}

/**
 * Glue between the simulation clock, the propagation worker, the keyframe
 * timeline and the point cloud. Lives outside Vue; nothing here is reactive.
 */
export class SatelliteLayer {
  readonly points: SatellitePoints
  private readonly worker: Worker
  private readonly timeline: KeyframeTimeline
  private ready = false
  private lastClockEpoch: number
  private lastRate: number
  private mix = 0
  private readonly unsubscribe: () => void
  readonly stats: PropagationStats

  constructor(
    private readonly scene: SceneController,
    records: OmmRecord[],
    private readonly clock: SimClock,
    options: { color: string; onStats?: (stats: PropagationStats) => void },
  ) {
    this.stats = { satellites: records.length, invalid: 0, lastPropagateMs: 0, initMs: 0 }
    this.points = new SatellitePoints(records.length, {
      color: options.color,
      pixelRatio: scene.renderer.getPixelRatio(),
    })
    scene.add(this.points.object)

    this.worker = new Worker(new URL('../workers/propagation.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.timeline = new KeyframeTimeline(records.length * KEYFRAME_STRIDE, (id, timeMs, buffer) => {
      this.post({ type: 'keyframe', id, timeMs, buffer }, [buffer.buffer])
    })
    this.lastClockEpoch = clock.epoch
    this.lastRate = clock.rate

    this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data
      if (msg.type === 'ready') {
        this.ready = true
        this.stats.initMs = msg.initMs
        this.stats.invalid = msg.invalidAtInit
        this.timeline.reset(this.clock.now(), this.clock.rate)
        return
      }
      this.stats.lastPropagateMs = msg.propagateMs
      this.stats.invalid = msg.failed
      options.onStats?.(this.stats)
      this.timeline.receive(msg.id, msg.timeMs, msg.buffer)
    }
    this.worker.onerror = (event) => console.error('Propagation worker error', event.message)
    this.post({ type: 'init', records })

    this.unsubscribe = scene.onFrame(this.onFrame)
  }

  /** Interpolation factor currently on screen (for CPU-side position reads). */
  get currentMix(): number {
    return this.mix
  }

  private readonly onFrame = (): void => {
    if (!this.ready) return
    const simMs = this.clock.now()
    // Paused: the clock is frozen, so treat the rate as 0 for scheduling.
    const rate = this.clock.paused ? 0 : this.clock.rate
    if (this.clock.epoch !== this.lastClockEpoch || rate !== this.lastRate) {
      this.lastClockEpoch = this.clock.epoch
      const wasPause = rate === 0 || this.lastRate === 0
      this.lastRate = rate
      // Pausing or resuming keeps the current pair (time didn't jump).
      if (!wasPause) this.timeline.reset(simMs, rate, this.resetLeadMs())
    }

    let t = this.timeline.advance(simMs, rate)
    if (t === NEEDS_RESET) {
      this.timeline.reset(simMs, rate, this.resetLeadMs())
      t = NOT_READY
    }
    // While a new pair is computed, the GPU keeps drawing the last uploaded
    // keyframes (the CPU copies are in the worker), so nothing flickers.
    if (t === NOT_READY) return

    const prev = this.timeline.prevKeyframe!
    const next = this.timeline.nextKeyframe!
    this.points.setKeyframes(prev.buffer, next.buffer)
    this.mix = t
    this.points.setMix(t)
  }

  /** Expected wall time for the worker to return a fresh pair. */
  private resetLeadMs(): number {
    return 2 * Math.max(this.stats.lastPropagateMs, 10) + 20
  }

  private post(message: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer)
  }

  dispose(): void {
    this.unsubscribe()
    this.worker.terminate()
    this.scene.remove(this.points.object)
    this.points.dispose()
  }
}
