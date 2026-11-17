/**
 * Close-approach screening for one satellite against the catalogue, off the
 * main thread (a few seconds of SGP4 for a crowded shell). Separate from the
 * propagation worker so positions keep updating while it runs.
 */
import { screenConjunctions, type Conjunction, type ScreeningTarget } from '../orbital/conjunctions'
import { createSatrec } from '../orbital/propagate'
import type { OmmRecord } from '../types/data-contract'

export type ToConjunctionWorker =
  | { type: 'init'; records: OmmRecord[] }
  | { type: 'screen'; id: number; primaryIndex: number; startMs: number; durationMs: number; thresholdKm: number }

export type FromConjunctionWorker =
  | { type: 'progress'; id: number; fraction: number }
  | { type: 'result'; id: number; conjunctions: Conjunction[]; screenedMs: number }
  | { type: 'error'; id: number; message: string }

const ctx = self as unknown as Worker
let targets: ScreeningTarget[] = []
let byIndex = new Map<number, ScreeningTarget>()

ctx.onmessage = (event: MessageEvent<ToConjunctionWorker>) => {
  const msg = event.data
  if (msg.type === 'init') {
    targets = []
    msg.records.forEach((r, index) => {
      const satrec = createSatrec(r)
      if (satrec) targets.push({ index, satrec, meanMotionRevPerDay: r.MEAN_MOTION, eccentricity: r.ECCENTRICITY })
    })
    byIndex = new Map(targets.map((t) => [t.index, t]))
    return
  }

  const primary = byIndex.get(msg.primaryIndex)
  if (!primary) {
    ctx.postMessage({ type: 'error', id: msg.id, message: 'This satellite has no valid orbit to screen.' } satisfies FromConjunctionWorker)
    return
  }
  const start = performance.now()
  let lastPost = 0
  const conjunctions = screenConjunctions(
    primary.satrec,
    { meanMotionRevPerDay: primary.meanMotionRevPerDay, eccentricity: primary.eccentricity },
    targets,
    msg.startMs,
    msg.durationMs,
    {
      thresholdKm: msg.thresholdKm,
      onProgress: (fraction) => {
        const now = performance.now()
        if (now - lastPost > 100 || fraction === 1) {
          lastPost = now
          ctx.postMessage({ type: 'progress', id: msg.id, fraction } satisfies FromConjunctionWorker)
        }
      },
    },
  )
  ctx.postMessage({
    type: 'result',
    id: msg.id,
    conjunctions,
    screenedMs: performance.now() - start,
  } satisfies FromConjunctionWorker)
}
