import { BufferAttribute, BufferGeometry, Color, Group, Line, LineBasicMaterial } from 'three'
import { RAD_TO_DEG } from '../orbital/constants'
import { ecfToGeodetic } from '../orbital/geodetic'
import { sampleGroundTrack } from '../orbital/ground-track'
import type { SatRec } from '../orbital/propagate'
import { latLonToScene, sceneToEcfKm } from './units'

/** Samples per orbital period. 120 keeps chords well inside the lift below. */
const SAMPLES_PER_ORBIT = 120
/** Track radius in Earth radii: just above the surface so it isn't z-fighting. */
const TRACK_RADIUS = 1.003

/**
 * The selected satellite's ground track: the last orbit (dim) and the next
 * orbit (bright), joined at the live subpoint.
 *
 * Samples sit on a fixed time grid (multiples of `step`), so they only change
 * when the clock crosses a grid line; between those, only the joining vertex
 * moves. That keeps the line steady at any time rate.
 */
export class GroundTrack {
  readonly group = new Group()
  private readonly pastGeometry = new BufferGeometry()
  private readonly futureGeometry = new BufferGeometry()
  private readonly pastPositions = new Float32Array((SAMPLES_PER_ORBIT + 2) * 3)
  private readonly futurePositions = new Float32Array((SAMPLES_PER_ORBIT + 2) * 3)
  private readonly samples = new Float64Array((2 * SAMPLES_PER_ORBIT + 1) * 2)
  private readonly pastMaterial: LineBasicMaterial
  private readonly futureMaterial: LineBasicMaterial
  private readonly ecf = new Float64Array(3)
  private readonly geo = new Float64Array(3)

  private satrec: SatRec | null = null
  private stepMs = 0
  private gridIndex = Number.NaN
  private pastCount = 0
  private futureCount = 0

  constructor(color: string) {
    this.pastGeometry.setAttribute('position', new BufferAttribute(this.pastPositions, 3))
    this.futureGeometry.setAttribute('position', new BufferAttribute(this.futurePositions, 3))
    const c = new Color(color)
    this.pastMaterial = new LineBasicMaterial({ color: c, transparent: true, opacity: 0.25, depthWrite: false })
    this.futureMaterial = new LineBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false })
    for (const [geometry, material] of [
      [this.pastGeometry, this.pastMaterial],
      [this.futureGeometry, this.futureMaterial],
    ] as const) {
      const line = new Line(geometry, material)
      line.frustumCulled = false
      this.group.add(line)
    }
    this.group.visible = false
  }

  setSatellite(satrec: SatRec | null, periodMin: number): void {
    this.satrec = satrec
    this.stepMs = (periodMin * 60_000) / SAMPLES_PER_ORBIT
    this.gridIndex = Number.NaN
    this.group.visible = false
  }

  /**
   * Advance to `simMs`. `satScene` is the satellite's current scene position
   * (from the point cloud), used for the live joining vertex.
   */
  update(simMs: number, satScene: { x: number; y: number; z: number } | null): void {
    if (!this.satrec || !satScene) {
      this.group.visible = false
      return
    }
    const grid = Math.floor(simMs / this.stepMs)
    if (grid !== this.gridIndex) this.resample(grid)
    if (this.pastCount + this.futureCount === 0) {
      this.group.visible = false
      return
    }

    // Live subpoint of the satellite, written as the last past vertex and the
    // first future vertex so the two halves meet exactly under it.
    sceneToEcfKm(satScene.x, satScene.y, satScene.z, this.ecf)
    ecfToGeodetic(this.ecf[0]!, this.ecf[1]!, this.ecf[2]!, this.geo)
    const lat = this.geo[0]! * RAD_TO_DEG
    const lon = this.geo[1]! * RAD_TO_DEG
    latLonToScene(lat, lon, TRACK_RADIUS, this.pastPositions, this.pastCount * 3)
    latLonToScene(lat, lon, TRACK_RADIUS, this.futurePositions, 0)
    this.pastGeometry.setDrawRange(0, this.pastCount + 1)
    this.futureGeometry.setDrawRange(0, this.futureCount + 1)
    ;(this.pastGeometry.attributes.position as BufferAttribute).needsUpdate = true
    ;(this.futureGeometry.attributes.position as BufferAttribute).needsUpdate = true
    this.group.visible = true
  }

  private resample(grid: number): void {
    if (!this.satrec) return
    this.gridIndex = grid
    // Grid times from one orbit back to one orbit ahead: indices 0..2N.
    const startMs = (grid - SAMPLES_PER_ORBIT + 1) * this.stepMs
    const n = SAMPLES_PER_ORBIT
    const written = sampleGroundTrack(this.satrec, startMs, this.stepMs, 2 * n, this.samples)

    // Past: grid points up to and including the one at or before now (indices 0..n-1).
    this.pastCount = Math.min(written, n)
    for (let k = 0; k < this.pastCount; k++) {
      latLonToScene(this.samples[k * 2]! * RAD_TO_DEG, this.samples[k * 2 + 1]! * RAD_TO_DEG, TRACK_RADIUS, this.pastPositions, k * 3)
    }
    // Future: grid points after now (indices n..2n-1), after the live vertex at 0.
    this.futureCount = Math.max(0, written - n)
    for (let k = 0; k < this.futureCount; k++) {
      const s = (n + k) * 2
      latLonToScene(this.samples[s]! * RAD_TO_DEG, this.samples[s + 1]! * RAD_TO_DEG, TRACK_RADIUS, this.futurePositions, (k + 1) * 3)
    }
  }

  dispose(): void {
    this.pastGeometry.dispose()
    this.futureGeometry.dispose()
    this.pastMaterial.dispose()
    this.futureMaterial.dispose()
  }
}
