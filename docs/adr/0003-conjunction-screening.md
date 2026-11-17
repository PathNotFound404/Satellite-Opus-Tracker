# ADR 0003: Screen close approaches for the selected satellite only, on demand, in a worker

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The roadmap's last stretch feature is conjunction highlighting: flagging close approaches below a threshold. The catalogue has 16,892 objects. All-pairs screening means about 143 million pairs, each needing a time search. That is out of reach for a browser tab, and the results wouldn't be meaningful anyway: public GP data is accurate to about a kilometre at epoch and degrades from there.

## Decision

- **Scope:** close approaches between the **selected satellite** and the rest of the catalogue, over the next 24 hours of simulation time, under 10 km.
- **On demand:** a "Check next 24 hours" button. It runs in a dedicated Web Worker (`workers/conjunction.worker.ts`), separate from the propagation worker so the globe keeps moving, and reports progress.
- **Algorithm** (`orbital/conjunctions.ts`):
  1. **Altitude-band filter:** skip objects whose perigee–apogee band can't come within the threshold (plus 50 km margin) of the primary's.
  2. **Coarse clearing every 5 minutes:** two objects can't close faster than the sum of their perigee speeds (vis-viva). So a sample farther apart than that speed × 150 s plus the threshold rules out its whole 5-minute window.
  3. **Fine pass every 60 s,** only in windows not ruled out (and one step either side). Every local minimum of distance shows up as a sign change of the range rate r·v, so none falls between samples.
  4. **Refinement:** estimate each minimum from linear relative motion. Refine those within the threshold + 20 km with a golden-section search on the true distance.
  5. **Exclude co-orbiting pairs:** within 5 km at under 20 m/s relative speed means docked or formation flying. Examples are a Soyuz on the ISS, whose element set differs slightly from the station's, and the station's own modules.
- **Presentation:** miss distance in whole kilometres (or "< 1 km"), relative speed, time. A permanent note says it is approximate and not a collision assessment.

## Validation

- **Unit tests:** 27 synthetic objects in the ISS shell, phased to cross the ISS's orbit at miss distances from 0 to ~100 km. The screener finds exactly the events a 1-second brute force finds, at the same times, with nothing extra.
- **Real catalogue, independent implementation:** compared against a Python brute force using Vallado's C++ SGP4 (`sgp4` 2.27 `SatrecArray`) at 1-second steps over all 16,892 objects, with a 50 km threshold:
  - **STARLINK-3055, 6 h:** 21 of 21 events matched, none missed and none extra. Largest miss-distance difference 0.6 km (the brute force's 1-second quantization).
  - **ISS, 3 h:** 32 of 32 real events matched, none extra. The other 25 brute-force events are the docked modules and vehicles (0.00–0.01 km), excluded by design.

## Results

Measured on the development machine, full catalogue, 24 h window:

| Primary | Time | Notes |
|---|---|---|
| ISS (crowded LEO shell) | 3.3–3.9 s | was 11.6 s before the coarse clearing pass |
| STARLINK-3055 | 0.2–1.0 s | |

60 fps on the main thread throughout (worst frame 16.8 ms).

## Consequences

- Answers "what passes near this satellite?" accurately enough for a portfolio and an educational tool. It doesn't produce a catalogue-wide conjunction list.
- The worker holds a second copy of the satrecs (about 150–250 ms to build, created the first time the button is used).
- Accuracy is bounded by GP data, not by the search. The UI says so.
