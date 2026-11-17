import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type WebGLRenderer,
} from 'three'

const ATMOSPHERE_RADIUS = 1.08

export interface Globe {
  group: Group
  dispose: () => void
}

/**
 * Textured Earth (radius 1 scene unit) with a thin atmosphere rim.
 * The Earth does not rotate with time: satellites are plotted in Earth-fixed
 * coordinates, so they move relative to a fixed globe.
 */
export function createGlobe(
  renderer: WebGLRenderer,
  textureUrl: string,
  onLoad?: () => void,
): Globe {
  const group = new Group()

  const texture = new TextureLoader().load(textureUrl, () => onLoad?.())
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const earthGeometry = new SphereGeometry(1, 128, 64)
  const earthMaterial = new MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0,
  })
  const earth = new Mesh(earthGeometry, earthMaterial)
  earth.name = 'earth'
  group.add(earth)

  // Back faces of a larger shell, brightest at Earth's limb and fading to
  // zero at the shell's silhouette: a soft halo that reads as atmosphere
  // without a scattering shader. The Earth occludes the shell's center.
  const atmosphereGeometry = new SphereGeometry(ATMOSPHERE_RADIUS, 64, 32)
  const atmosphereMaterial = new ShaderMaterial({
    uniforms: {
      glowColor: { value: new Color(0x4da3ff) },
      // |dot(normal, view)| on the shell where it meets Earth's limb.
      limbDot: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_RADIUS * ATMOSPHERE_RADIUS)) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      uniform float limbDot;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float d = -dot(normalize(vNormal), normalize(vViewDir));
        float t = clamp(d / limbDot, 0.0, 1.0);
        float intensity = pow(t, 3.0) * 0.55;
        gl_FragColor = vec4(glowColor * intensity, intensity);
      }
    `,
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const atmosphere = new Mesh(atmosphereGeometry, atmosphereMaterial)
  atmosphere.name = 'atmosphere'
  group.add(atmosphere)

  return {
    group,
    dispose() {
      earthGeometry.dispose()
      earthMaterial.dispose()
      texture.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
    },
  }
}
