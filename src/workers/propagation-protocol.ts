import type { OmmRecord } from '../types/data-contract'

/**
 * Keyframe layout: 4 floats per satellite, in scene units:
 * [x, y, z, valid] where valid is 1, or 0 when SGP4 failed (x, y, z are then 0).
 * NaN is never written, so the GPU never sees it.
 */
export const KEYFRAME_STRIDE = 4

export type ToWorker =
  | { type: 'init'; records: OmmRecord[] }
  | { type: 'keyframe'; id: number; timeMs: number; buffer: Float32Array }

export type FromWorker =
  | { type: 'ready'; count: number; invalidAtInit: number; initMs: number }
  | {
      type: 'keyframe'
      id: number
      timeMs: number
      buffer: Float32Array
      failed: number
      propagateMs: number
    }
