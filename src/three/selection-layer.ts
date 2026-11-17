import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { sampleOrbitTeme } from '../orbital/orbit'
import { periodMinutes, type SatRec } from '../orbital/propagate'
import { gmstAt } from '../orbital/time'
import type { SimClock } from '../utils/sim-clock'
import { GroundTrack } from './ground-track'
import type { SatelliteLayer } from './satellite-layer'
import type { SceneController } from './scene'
import { ecfKmToScene } from './units'

const ORBIT_SAMPLES = 256
/** Re-sample the orbit this often (sim time); elements drift slowly. */
const ORBIT_RESAMPLE_MS = 60_000

/**
 * Highlight ring on the selected satellite, its orbit line and its ground track.
 *
 * The orbit is the inertial ellipse: one period of TEME positions, drawn in a
 * group rotated about the polar axis by -GMST(now) each frame. That is the
 * same TEME->ECF rotation as orbital/frames.ts, applied to the whole line at
 * once, so the line always passes through the satellite and turns with the
 * Earth without re-sampling every frame.
 */
export class SelectionLayer {
  private readonly orbitGroup = new Group()
  private readonly orbitPositions = new Float32Array(ORBIT_SAMPLES * 3)
  private readonly orbitTemeKm = new Float32Array(ORBIT_SAMPLES * 3)
  private readonly orbitGeometry = new BufferGeometry()
  private readonly orbitMaterial: LineBasicMaterial
  private readonly orbitLine: Line
  private readonly markerGeometry = new BufferGeometry()
  private readonly markerMaterial: ShaderMaterial
  private readonly marker: Points
  private readonly markerPosition = new Float32Array(3)
  private readonly scratch = new Vector3()
  private readonly groundTrack: GroundTrack
  private readonly unsubscribe: () => void

  private index = -1
  private satrec: SatRec | null = null
  private periodMin = 0
  private sampledAtMs = Number.NaN

  constructor(
    private readonly scene: SceneController,
    private readonly satellites: SatelliteLayer,
    private readonly clock: SimClock,
    options: { color: string; trackColor: string; pixelRatio: number },
  ) {
    const color = new Color(options.color)

    this.orbitGeometry.setAttribute('position', new BufferAttribute(this.orbitPositions, 3))
    this.orbitMaterial = new LineBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false })
    this.orbitLine = new Line(this.orbitGeometry, this.orbitMaterial)
    this.orbitLine.frustumCulled = false
    this.orbitGroup.add(this.orbitLine)
    this.orbitGroup.visible = false
    scene.add(this.orbitGroup)

    this.markerGeometry.setAttribute('position', new BufferAttribute(this.markerPosition, 3))
    this.markerMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uSize: { value: 22 * options.pixelRatio },
      },
      vertexShader: /* glsl */ `
        uniform float uSize;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          // A ring with a solid centre dot.
          float ring = smoothstep(0.62, 0.72, d) * (1.0 - smoothstep(0.86, 0.96, d));
          float dot = 1.0 - smoothstep(0.22, 0.32, d);
          float a = max(ring, dot);
          if (a <= 0.0) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
    this.marker = new Points(this.markerGeometry, this.markerMaterial)
    this.marker.frustumCulled = false
    this.marker.renderOrder = 2
    this.marker.visible = false
    scene.add(this.marker)

    // Neutral white so the surface track reads as distinct from the accent-blue orbit.
    this.groundTrack = new GroundTrack(options.trackColor)
    scene.add(this.groundTrack.group)

    this.unsubscribe = scene.onFrame(this.onFrame)
  }

  /** Select satellite `index` (with its satrec and mean motion), or clear with -1. */
  select(index: number, satrec: SatRec | null, meanMotionRevPerDay: number): void {
    this.index = satrec ? index : -1
    this.satrec = satrec
    this.periodMin = periodMinutes(meanMotionRevPerDay)
    this.sampledAtMs = Number.NaN
    this.groundTrack.setSatellite(satrec, this.periodMin)
    if (this.index < 0) {
      this.orbitGroup.visible = false
      this.marker.visible = false
    }
  }

  private resampleOrbit(simMs: number): void {
    if (!this.satrec) return
    const written = sampleOrbitTeme(this.satrec, simMs, this.periodMin, ORBIT_SAMPLES, this.orbitTemeKm)
    for (let k = 0; k < written; k++) {
      ecfKmToScene(
        this.orbitTemeKm[k * 3]!,
        this.orbitTemeKm[k * 3 + 1]!,
        this.orbitTemeKm[k * 3 + 2]!,
        this.orbitPositions,
        k * 3,
      )
    }
    this.orbitGeometry.setDrawRange(0, written)
    ;(this.orbitGeometry.attributes.position as BufferAttribute).needsUpdate = true
    this.sampledAtMs = simMs
    this.orbitGroup.visible = written > 1
  }

  private readonly onFrame = (): void => {
    if (this.index < 0) return
    const simMs = this.clock.now()

    if (!(Math.abs(simMs - this.sampledAtMs) < ORBIT_RESAMPLE_MS)) this.resampleOrbit(simMs)
    // TEME -> ECF is a rotation of -GMST about the polar axis (scene y).
    this.orbitGroup.rotation.y = -gmstAt(simMs)

    // Same interpolated position as the point cloud, so the ring sits exactly on the dot.
    if (this.satellites.points.positionOf(this.index, this.satellites.currentMix, this.scratch)) {
      this.markerPosition[0] = this.scratch.x
      this.markerPosition[1] = this.scratch.y
      this.markerPosition[2] = this.scratch.z
      ;(this.markerGeometry.attributes.position as BufferAttribute).needsUpdate = true
      this.marker.visible = true
      this.groundTrack.update(simMs, this.scratch)
    } else {
      this.marker.visible = false
      this.groundTrack.update(simMs, null)
    }
  }

  dispose(): void {
    this.unsubscribe()
    this.scene.remove(this.orbitGroup)
    this.scene.remove(this.marker)
    this.scene.remove(this.groundTrack.group)
    this.groundTrack.dispose()
    this.orbitGeometry.dispose()
    this.orbitMaterial.dispose()
    this.markerGeometry.dispose()
    this.markerMaterial.dispose()
  }
}
