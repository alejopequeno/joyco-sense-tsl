import { mx_noise_float, positionWorld, smoothstep, uniform } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

import { colorSpline } from '@/gl/nodes/color-spline'

/**
 * Ported from spite/sketch (MIT) — `post-cartoon-iii/Material.js`.
 *
 * The original patches `MeshStandardMaterial` through `onBeforeCompile`,
 * splicing a 130-line Perlin implementation and a colour spline into the
 * fragment shader by string replacement. Here the same two pieces are nodes:
 * `mx_noise_float` ships with three, and the shaded colour is multiplied by the
 * ramp through `colorNode` — no string surgery, no compile hook.
 */

// Noise frequency over world space. Low, so the blotches read as large patches
// of colour rather than speckle.
const NOISE_SCALE = 0.05
// The original smoothsteps with a half-width of 0.5 over a signed noise
// remapped to 0..1, which is a near pass-through — it only softens the tails.
const CONTRAST_EDGE = 0.5

export function createSpiderVerseMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: 0x808080,
    roughness: 0.2,
    metalness: 0.1,
  })

  const noiseScale = uniform(NOISE_SCALE)

  // World position, not UV: the blotches then belong to the object in space, so
  // rotating the logo carries its colouring with it instead of sliding it
  // across the surface.
  const noise = mx_noise_float(positionWorld.mul(noiseScale)).mul(0.5).add(0.5)
  const t = smoothstep(0.5 - CONTRAST_EDGE, 0.5 + CONTRAST_EDGE, noise)

  // The sketch tints *after* lighting (`gl_FragColor.rgb *= 2. * spline`).
  // Tinting the albedo instead lands in the same place: diffuse response is
  // linear in albedo, and its base `0x808080` doubled is exactly 1. Specular
  // picks up a little of the ramp that the original leaves untinted, which at
  // `metalness: 0.1` is not a visible difference.
  material.colorNode = colorSpline(t)

  return material
}
