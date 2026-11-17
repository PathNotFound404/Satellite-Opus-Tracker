import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type WebGLRenderer,
} from 'three'
import type { Lighting } from './lighting'

const ATMOSPHERE_RADIUS = 1.08

export interface Globe {
  group: Group
  dispose: () => void
}

/**
 * Textured Earth (radius 1 scene unit) with a thin atmosphere rim.
 * The Earth does not rotate with time: satellites are plotted in Earth-fixed
 * coordinates, so they move relative to a fixed globe.
 *
 * One shader handles both looks: even lighting (a soft key light from the
 * viewer's side) and day/night shading from the Sun direction with a city
 * lights texture on the night side. `lighting.shading` blends between them.
 */
export function createGlobe(
  renderer: WebGLRenderer,
  textures: { day: string; night: string },
  lighting: Lighting,
  onLoad?: () => void,
): Globe {
  const group = new Group()
  const loader = new TextureLoader()
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const dayMap = loader.load(textures.day, () => onLoad?.())
  const nightMap = loader.load(textures.night)
  for (const t of [dayMap, nightMap]) {
    t.colorSpace = SRGBColorSpace
    t.anisotropy = anisotropy
  }

  const earthGeometry = new SphereGeometry(1, 128, 64)
  const earthMaterial = new ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      uSunDir: lighting.sunDirection,
      uShading: lighting.shading,
      // View-space key light for the even look (upper left, toward the viewer).
      uKeyDir: { value: new Vector3(-0.45, 0.45, 0.77).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform vec3 uSunDir;
      uniform float uShading;
      uniform vec3 uKeyDir;
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vNormalView;
      void main() {
        vec3 day = texture2D(dayMap, vUv).rgb;
        vec3 night = texture2D(nightMap, vUv).rgb;

        // Even look: what M1 shipped, a soft key light from the viewer's side.
        float key = max(dot(normalize(vNormalView), uKeyDir), 0.0);
        vec3 even = day * (0.82 + 0.38 * key);

        // Day/night: cosine of the solar zenith angle, with a soft twilight
        // band a few degrees wide around the terminator.
        float cosZenith = dot(normalize(vNormalWorld), uSunDir);
        float daylight = smoothstep(-0.06, 0.1, cosZenith);
        vec3 lit = day * (0.62 + 0.62 * clamp(cosZenith, 0.0, 1.0));
        vec3 dark = night * 0.85;
        vec3 shaded = mix(dark, lit, daylight);

        gl_FragColor = vec4(mix(even, shaded, uShading), 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const earth = new Mesh(earthGeometry, earthMaterial)
  earth.name = 'earth'
  group.add(earth)

  // Back faces of a larger shell, brightest at Earth's limb and fading to
  // zero at the shell's silhouette: a soft halo that reads as atmosphere
  // without a scattering shader. The Earth occludes the shell's center.
  // With shading on, the halo is brighter on the day side.
  const atmosphereGeometry = new SphereGeometry(ATMOSPHERE_RADIUS, 64, 32)
  const atmosphereMaterial = new ShaderMaterial({
    uniforms: {
      glowColor: { value: new Color(0x4da3ff) },
      // |dot(normal, view)| on the shell where it meets Earth's limb.
      limbDot: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_RADIUS * ATMOSPHERE_RADIUS)) },
      uSunDir: lighting.sunDirection,
      uShading: lighting.shading,
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldDir;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        vWorldDir = normalize(mat3(modelMatrix) * position);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      uniform float limbDot;
      uniform vec3 uSunDir;
      uniform float uShading;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldDir;
      void main() {
        float d = -dot(normalize(vNormal), normalize(vViewDir));
        float t = clamp(d / limbDot, 0.0, 1.0);
        float sunSide = smoothstep(-0.35, 0.25, dot(normalize(vWorldDir), uSunDir));
        float intensity = pow(t, 3.0) * 0.55 * mix(1.0, 0.25 + 0.95 * sunSide, uShading);
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
      dayMap.dispose()
      nightMap.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
    },
  }
}
