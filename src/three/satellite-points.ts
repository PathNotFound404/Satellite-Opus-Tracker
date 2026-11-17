import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Points,
  RawShaderMaterial,
} from 'three'
import { KEYFRAME_STRIDE } from '../workers/propagation-protocol'

/**
 * Every satellite in one THREE.Points draw call.
 *
 * Positions come from two keyframes (`aPrev`, `aNext`: vec4 of scene xyz +
 * valid flag) and the vertex shader interpolates between them with `uMix`, so
 * per-frame CPU cost is one uniform write. `aMask` (0/1) hides points for
 * filters without rebuilding geometry.
 */
export class SatellitePoints {
  readonly object: Points<BufferGeometry, RawShaderMaterial>
  private readonly geometry: BufferGeometry
  private readonly material: RawShaderMaterial
  private readonly prevAttr: BufferAttribute
  private readonly nextAttr: BufferAttribute
  readonly maskAttr: BufferAttribute
  readonly count: number

  constructor(count: number, options: { color: string; pixelRatio: number }) {
    this.count = count
    this.geometry = new BufferGeometry()
    this.prevAttr = new BufferAttribute(new Float32Array(count * KEYFRAME_STRIDE), KEYFRAME_STRIDE)
    this.nextAttr = new BufferAttribute(new Float32Array(count * KEYFRAME_STRIDE), KEYFRAME_STRIDE)
    this.maskAttr = new BufferAttribute(new Float32Array(count).fill(1), 1)
    // three.js derives the draw count from `position`; the next keyframe doubles as it.
    this.geometry.setAttribute('position', this.nextAttr)
    this.geometry.setAttribute('aPrev', this.prevAttr)
    this.geometry.setAttribute('aMask', this.maskAttr)

    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        uMix: { value: 0 },
        uSize: { value: 2.4 },
        uPixelRatio: { value: options.pixelRatio },
        uColor: { value: new Color(options.color) },
        uOpacity: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uMix;
        uniform float uSize;
        uniform float uPixelRatio;
        in vec4 position; // next keyframe: xyz scene units, w = valid
        in vec4 aPrev;    // previous keyframe
        in float aMask;   // filter visibility
        void main() {
          if (position.w * aPrev.w * aMask < 0.5) {
            // Hidden: put it outside the clip volume so it's never rasterised.
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
          }
          vec3 p = mix(aPrev.xyz, position.xyz, uMix);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // Slightly larger when close, never below ~1.5 px.
          gl_PointSize = uSize * uPixelRatio * clamp(3.2 / -mv.z, 0.65, 1.8);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColor;
        uniform float uOpacity;
        out vec4 fragColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.3, 0.5, d);
          if (a <= 0.0) discard;
          fragColor = vec4(uColor, a * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    })

    this.object = new Points(this.geometry, this.material)
    this.object.name = 'satellites'
    // Satellites span the whole scene; per-object frustum culling only costs a
    // bounding-sphere computation and never culls anything.
    this.object.frustumCulled = false
    this.object.renderOrder = 1
    this.object.visible = false
  }

  /** Swap in new keyframe buffers (same length). Uploaded to the GPU once. */
  setKeyframes(prev: Float32Array, next: Float32Array): void {
    if (this.prevAttr.array !== prev) {
      this.prevAttr.array = prev
      this.prevAttr.needsUpdate = true
    }
    if (this.nextAttr.array !== next) {
      this.nextAttr.array = next
      this.nextAttr.needsUpdate = true
    }
    this.object.visible = true
  }

  setMix(t: number): void {
    this.material.uniforms.uMix!.value = t
  }

  /** Call after editing maskAttr.array. */
  maskChanged(): void {
    this.maskAttr.needsUpdate = true
  }

  /** Current scene position of satellite i (CPU-side, same interpolation as the shader). */
  positionOf(i: number, mix: number, out: { x: number; y: number; z: number }): boolean {
    const prev = this.prevAttr.array as Float32Array
    const next = this.nextAttr.array as Float32Array
    const o = i * KEYFRAME_STRIDE
    // A detached (transferred) buffer has length 0.
    if (o + 3 >= prev.length || o + 3 >= next.length) return false
    if (prev[o + 3]! < 0.5 || next[o + 3]! < 0.5) return false
    out.x = prev[o]! + (next[o]! - prev[o]!) * mix
    out.y = prev[o + 1]! + (next[o + 1]! - prev[o + 1]!) * mix
    out.z = prev[o + 2]! + (next[o + 2]! - prev[o + 2]!) * mix
    return true
  }

  setPixelRatio(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio!.value = pixelRatio
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
