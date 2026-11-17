import { Vector3 } from 'three'
import { sunDirectionEcf } from '../orbital/sun'
import { ecfKmToScene } from './units'

/**
 * Sun direction and shading amount, as uniform objects shared by every
 * material that cares (globe, satellites). Updating them here updates all.
 */
export class Lighting {
  /** Unit vector toward the Sun, scene axes. */
  readonly sunDirection = { value: new Vector3(1, 0, 0) }
  /** 0 = even lighting (no day/night), 1 = full day/night shading. */
  readonly shading = { value: 1 }

  private readonly ecf = new Float64Array(3)
  private readonly scene = new Float64Array(3)
  private target = 1
  private fadeFrom = 1
  private fadeStartMs = -1

  constructor(private readonly fadeMs: number) {}

  /** Recompute the Sun direction for a simulation time. Allocation-free. */
  update(simMs: number, nowMs: number): void {
    sunDirectionEcf(simMs, this.ecf)
    // Same axis mapping as satellite positions; the km scale cancels on normalise.
    ecfKmToScene(this.ecf[0]!, this.ecf[1]!, this.ecf[2]!, this.scene)
    this.sunDirection.value.set(this.scene[0]!, this.scene[1]!, this.scene[2]!).normalize()

    if (this.fadeStartMs >= 0) {
      const t = this.fadeMs <= 0 ? 1 : Math.min(1, (nowMs - this.fadeStartMs) / this.fadeMs)
      this.shading.value = this.fadeFrom + (this.target - this.fadeFrom) * t
      if (t >= 1) this.fadeStartMs = -1
    }
  }

  setEnabled(enabled: boolean, nowMs: number): void {
    this.target = enabled ? 1 : 0
    this.fadeFrom = this.shading.value
    this.fadeStartMs = nowMs
  }
}
