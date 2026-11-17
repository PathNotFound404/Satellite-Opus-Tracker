# ADR 0002: Propagate in a Web Worker at 1 Hz and interpolate on the GPU

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The full catalog is 16,892 satellites (CelesTrak `active`, 2026-11-17), well above the 10k planning figure. The target is 60 fps on a mid-range laptop, which leaves about 16.6 ms per frame for everything, rendering included.

Measured on the development machine (Node 24, Windows, desktop CPU) for one SGP4 pass over the whole catalog:

| Method | Time per full pass |
|---|---|
| satellite.js `sgp4()` in JS | 14–23 ms (first pass 108 ms while the JIT warms up), plus a result object per call for the GC |
| satellite.js 7 WASM `BulkPropagator` (single thread) | about 10 ms |
| `json2satrec` for all records (one-time) | about 150–210 ms |

Either way, a full pass per frame would use most or all of the frame budget on the main thread, so the architecture doc's starting point (per-frame main-thread propagation) doesn't hold.

## Decision

Combine both fallback options from `architecture.md`:

1. **Web Worker.** `src/workers/propagation.worker.ts` builds the satrecs once and, on request, propagates every satellite at one time. It converts TEME→ECF (`orbital/frames.ts`) and km→scene units (`three/units.ts`), and writes `[x, y, z, valid]` per satellite into a `Float32Array`. Buffers are transferred both ways, so nothing is copied.
2. **Lower-rate keyframes with GPU interpolation.** Keyframes are 1 s apart (wall clock). `three/keyframe-timeline.ts` keeps three rotating buffers: `prev` and `next` are on screen, and a third is computed ahead. The vertex shader in `three/satellite-points.ts` mixes `prev` and `next` with a single `uMix` uniform. Per frame, the main thread does one uniform write and no per-satellite work. Each keyframe is uploaded to the GPU once (about 270 KB).

The worker uses the plain JS `sgp4()`, not the WASM `BulkPropagator`. At about 15 ms once per second in a background thread, it is fast enough. The JS path avoids a WASM build step and keeps the satrecs in the same form as the rest of `orbital/`. Switching later only touches the worker.

### Accuracy of interpolation

Linear interpolation between two Earth-fixed points 1 s apart cuts the corner of the arc. For LEO (7.6 km/s, r ≈ 6,800 km) the arc spans θ ≈ 1.1 mrad and the error is about r·θ²/8 ≈ 1 m. That is negligible next to SGP4's own kilometre-level error.

At faster time rates (M6), keyframe spacing grows to `1 s × rate`, capped at 30 s of simulation time. At the cap the LEO interpolation error is about 1 km, still below SGP4 accuracy and invisible on screen. Beyond that rate the worker simply produces keyframes more often in wall time (30 s at 1000x is 33 per second, about 50% of one worker thread). If that turns out to be too much, the next step is Hermite interpolation using the velocities.

### Invalid satellites

The worker writes `valid = 0` (and zeros, never NaN) when SGP4 fails. The vertex shader moves any point whose `prev` or `next` keyframe is invalid outside the clip volume, so it is never drawn at the origin or at a stale position.

## Results

Edge, NVIDIA GTX 1050 Ti, 1440x900, full catalog of 16,892 satellites:

- **60 fps**, p50 frame 16.7 ms, p95 16.8 ms, worst 16.8 ms over 4 s (rAF timing).
- Worker: about 15 ms per keyframe, once per second.
- Main-thread allocation, sampled with the CDP heap profiler over 6 s of steady rendering: about 35 KB total. All of it is in three.js internals and the once-per-second worker message. The app's own per-frame code allocates nothing.

The development machine is a desktop with a GTX 1050 Ti, which is about the same GPU class as a mid-range laptop. Most of the per-frame work now sits on the GPU (17k points), and that load is light.

## Consequences

- Satellite positions on the CPU are not updated every frame. Anything that needs them (click picking, M4) reads the same interpolation from the keyframe buffers (`SatellitePoints.positionOf`). The selected satellite's info panel propagates that one satellite directly for exact values.
- The clock (`utils/sim-clock.ts`) bumps an `epoch` on jumps. The layer resets its keyframes then, and hides the points until the new pair is ready (normally one or two frames).
- Vite builds workers as ES modules (`worker.format: 'es'`), which every current browser supports.
