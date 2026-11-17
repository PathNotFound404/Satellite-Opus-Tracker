import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three'
import { latLonToScene } from './units'

/** A small ring on the Earth's surface at the observer's location. */
export class ObserverMarker {
  readonly object: Points
  private readonly geometry = new BufferGeometry()
  private readonly material: ShaderMaterial
  private readonly position = new Float32Array(3)

  constructor(color: string, pixelRatio: number) {
    this.geometry.setAttribute('position', new BufferAttribute(this.position, 3))
    this.material = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(color) }, uSize: { value: 16 * pixelRatio } },
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
          float ring = smoothstep(0.55, 0.68, d) * (1.0 - smoothstep(0.82, 0.95, d));
          float dot = 1.0 - smoothstep(0.18, 0.3, d);
          float a = max(ring, dot);
          if (a <= 0.0) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
    this.object = new Points(this.geometry, this.material)
    this.object.frustumCulled = false
    this.object.renderOrder = 2
    this.object.visible = false
  }

  set(latDeg: number, lonDeg: number): void {
    latLonToScene(latDeg, lonDeg, 1.002, this.position)
    ;(this.geometry.attributes.position as BufferAttribute).needsUpdate = true
    this.object.visible = true
  }

  hide(): void {
    this.object.visible = false
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
