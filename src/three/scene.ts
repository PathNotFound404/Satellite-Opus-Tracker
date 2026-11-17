import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createGlobe, type Globe } from './globe'

export type FrameCallback = (nowMs: number) => void

export interface SceneOptions {
  textureUrl: string
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
  private readonly globe: Globe
  private readonly frameCallbacks = new Set<FrameCallback>()
  private readonly resizeObserver: ResizeObserver
  private readonly container: HTMLElement

  constructor(container: HTMLElement, options: SceneOptions) {
    this.container = container

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
    })

    // Even, calm lighting: a strong ambient plus a key light that follows the
    // camera, so the side you look at is always lit. Real day/night shading is
    // a separate stretch feature.
    this.scene.add(new AmbientLight(0xffffff, 1.6))
    const key = new DirectionalLight(0xffffff, 1.4)
    key.position.set(-1.5, 1.5, 2)
    this.camera.add(key)
    this.scene.add(this.camera)

    this.globe = createGlobe(this.renderer, options.textureUrl, options.onGlobeReady)
    this.scene.add(this.globe.group)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.renderer.setAnimationLoop(this.tick)
  }

  add(object: Object3D): void {
    this.scene.add(object)
  }

  remove(object: Object3D): void {
    this.scene.remove(object)
  }

  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback)
    return () => this.frameCallbacks.delete(callback)
  }

  stopAutoRotate(): void {
    this.controls.autoRotate = false
  }

  private readonly tick = (nowMs: number): void => {
    // Slow the drag rate as the camera gets close, so close-ups stay controllable.
    const distance = this.camera.position.length()
    this.controls.rotateSpeed = Math.min(1, Math.max(0.08, (distance - 1) / 2.5))
    this.controls.update()
    for (const callback of this.frameCallbacks) callback(nowMs)
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
    this.frameCallbacks.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
