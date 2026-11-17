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
  private lastRateSign: number
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
    this.lastRateSign = Math.sign(clock.rate)

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
    const rate = this.clock.rate
    const rateSign = Math.sign(rate)
    if (this.clock.epoch !== this.lastClockEpoch || rateSign !== this.lastRateSign) {
      this.lastClockEpoch = this.clock.epoch
      this.lastRateSign = rateSign
      this.timeline.reset(simMs, rate)
    }

    let t = this.timeline.advance(simMs, rate)
    if (t === NEEDS_RESET) {
      this.timeline.reset(simMs, rate)
      t = NOT_READY
    }
    if (t === NOT_READY) {
      // After a reset the old keyframe buffers are inside the worker
      // (transferred, so detached here). Hide until a fresh pair arrives.
      this.points.object.visible = false
      return
    }

    const prev = this.timeline.prevKeyframe!
    const next = this.timeline.nextKeyframe!
    this.points.setKeyframes(prev.buffer, next.buffer)
    this.mix = t
    this.points.setMix(t)
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
