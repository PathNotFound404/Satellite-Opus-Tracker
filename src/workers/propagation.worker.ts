/**
 * Propagates every satellite at a requested time, off the main thread.
 * See docs/adr/0002-propagation-strategy.md.
 *
 * Buffers are transferred in and out (no copies). satellite.js allocates a
 * small result object per call; that garbage stays in this worker and never
 * touches the render loop.
 */
import { createSatrec, propagateEcfInto, type SatRec } from '../orbital/propagate'
import { gmstAt } from '../orbital/time'
import { ecfKmToScene } from '../three/units'
import { KEYFRAME_STRIDE, type FromWorker, type ToWorker } from './propagation-protocol'

// Typed as a Worker so postMessage accepts a transfer list without pulling in
// the WebWorker lib (which conflicts with DOM types in this tsconfig).
const ctx = self as unknown as Worker

let satrecs: (SatRec | null)[] = []
const ecfKm = new Float64Array(3)

function post(message: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer)
}

ctx.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  if (msg.type === 'init') {
    const start = performance.now()
    satrecs = msg.records.map(createSatrec)
    post({
      type: 'ready',
      count: satrecs.length,
      invalidAtInit: satrecs.filter((s) => s === null).length,
      initMs: performance.now() - start,
    })
    return
  }

  const { buffer, timeMs, id } = msg
  const start = performance.now()
  const gmst = gmstAt(timeMs)
  let failed = 0
  for (let i = 0; i < satrecs.length; i++) {
    const o = i * KEYFRAME_STRIDE
    const satrec = satrecs[i]
    if (satrec && propagateEcfInto(satrec, timeMs, gmst, ecfKm)) {
      ecfKmToScene(ecfKm[0]!, ecfKm[1]!, ecfKm[2]!, buffer, o)
      buffer[o + 3] = 1
    } else {
      buffer[o] = 0
      buffer[o + 1] = 0
      buffer[o + 2] = 0
      buffer[o + 3] = 0
      failed++
    }
  }
  post(
    { type: 'keyframe', id, timeMs, buffer, failed, propagateMs: performance.now() - start },
    [buffer.buffer],
  )
}
