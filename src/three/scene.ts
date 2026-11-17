import {
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createGlobe, type Globe } from './globe'
import { Lighting } from './lighting'

export type FrameCallback = (nowMs: number) => void

export interface SceneOptions {
  textures: { day: string; night: string }
  reducedMotion: boolean
  onGlobeReady?: () => void
}

const MIN_CAMERA_DISTANCE = 1.15
const MAX_CAMERA_DISTANCE = 14
const START_CAMERA_DISTANCE = 3.6

/**
 * Owns the renderer, camera, controls and render loop. Kept free of Vue so it
 * can be driven from any component, and so no three.js object becomes reactive.
 */
export class SceneController {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly lighting: Lighting
  private readonly globe: Globe
  // An array, not a Set: iterating it each frame allocates no iterator.
  private readonly frameCallbacks: FrameCallback[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly container: HTMLElement
  private readonly reducedMotion: boolean
  // Camera fly-to state (preallocated; animated in tick()).
  private readonly flyFrom = new Vector3()
  private readonly flyTo = new Vector3()
  private flyFromDistance = 0
  private flyToDistance = 0
  private flyStartMs = -1
  private flyDurationMs = 900

  constructor(container: HTMLElement, options: SceneOptions) {
    this.container = container
    this.reducedMotion = options.reducedMotion

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)
    container.appendChild(this.renderer.domElement)

    this.camera = new PerspectiveCamera(40, 1, 0.01, 200)
    // Start over the Atlantic, slightly north, so the Americas, Europe and
    // Africa are all in view.
    this.camera.position.set(
      START_CAMERA_DISTANCE * 0.82,
      START_CAMERA_DISTANCE * 0.42,
      START_CAMERA_DISTANCE * 0.4,
    )

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = MIN_CAMERA_DISTANCE
    this.controls.maxDistance = MAX_CAMERA_DISTANCE
    this.controls.zoomSpeed = 0.8
    this.controls.autoRotate = !options.reducedMotion
    this.controls.autoRotateSpeed = 0.25
    // Any user interaction stops the idle rotation for good.
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      // A drag takes over from any camera animation.
      this.flyStartMs = -1
    })

    // Lighting is done in the globe and satellite shaders (no three.js lights);
    // this holds the shared Sun direction and day/night amount.
    this.lighting = new Lighting(options.reducedMotion ? 0 : 400)

    this.globe = createGlobe(this.renderer, options.textures, this.lighting, options.onGlobeReady)
    this.scene.add(this.globe.group)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    // The FOV is vertical, so on portrait screens pull back until the whole
    // Earth (plus some orbit) fits the width. Only at startup; after that the
    // user owns the zoom.
    if (this.camera.aspect < 1) {
      const scale = Math.min(MAX_CAMERA_DISTANCE / START_CAMERA_DISTANCE, 1 / this.camera.aspect)
      this.camera.position.multiplyScalar(scale)
    }

    this.renderer.setAnimationLoop(this.tick)
  }

  add(object: Object3D): void {
    this.scene.add(object)
  }

  remove(object: Object3D): void {
    this.scene.remove(object)
  }

  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.push(callback)
    return () => {
      const i = this.frameCallbacks.indexOf(callback)
      if (i >= 0) this.frameCallbacks.splice(i, 1)
    }
  }

  stopAutoRotate(): void {
    this.controls.autoRotate = false
  }

  /**
   * Swing the camera to look at `target` (scene units) from outside it, along
   * the line from the Earth's centre. Keeps orbit-controls behaviour: the
   * camera still orbits the Earth's centre afterwards.
   */
  flyToward(target: Vector3, distance?: number): void {
    this.stopAutoRotate()
    const targetRadius = target.length()
    const current = this.camera.position.length()
    // Stand back far enough to see the satellite against the Earth.
    const wanted = distance ?? Math.min(MAX_CAMERA_DISTANCE, Math.max(targetRadius + 1.4, Math.min(current, 4)))
    this.flyFrom.copy(this.camera.position).normalize()
    this.flyTo.copy(target).normalize()
    this.flyFromDistance = current
    this.flyToDistance = wanted
    if (this.reducedMotion) {
      this.camera.position.copy(this.flyTo).multiplyScalar(wanted)
      this.flyStartMs = -1
      return
    }
    this.flyStartMs = performance.now()
  }

  private stepFlight(nowMs: number): void {
    if (this.flyStartMs < 0) return
    const t = Math.min(1, (nowMs - this.flyStartMs) / this.flyDurationMs)
    // easeInOutCubic: gentle start and landing.
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    // Spherical interpolation of the direction keeps the camera outside the Earth.
    const dot = Math.min(1, Math.max(-1, this.flyFrom.dot(this.flyTo)))
    const angle = Math.acos(dot)
    const distance = this.flyFromDistance + (this.flyToDistance - this.flyFromDistance) * e
    if (angle < 1e-4) {
      this.camera.position.copy(this.flyTo).multiplyScalar(distance)
    } else {
      const s = Math.sin(angle)
      const a = Math.sin((1 - e) * angle) / s
      const b = Math.sin(e * angle) / s
      this.camera.position.set(
        (this.flyFrom.x * a + this.flyTo.x * b) * distance,
        (this.flyFrom.y * a + this.flyTo.y * b) * distance,
        (this.flyFrom.z * a + this.flyTo.z * b) * distance,
      )
    }
    if (t >= 1) this.flyStartMs = -1
  }

  private readonly tick = (nowMs: number): void => {
    // Slow the drag rate as the camera gets close, so close-ups stay controllable.
    const distance = this.camera.position.length()
    this.controls.rotateSpeed = Math.min(1, Math.max(0.08, (distance - 1) / 2.5))
    this.stepFlight(nowMs)
    this.controls.update()
    for (let i = 0; i < this.frameCallbacks.length; i++) this.frameCallbacks[i]!(nowMs)
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.globe.dispose()
    this.frameCallbacks.length = 0
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
