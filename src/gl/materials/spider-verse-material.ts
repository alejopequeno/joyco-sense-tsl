import {
  cameraPosition,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  step,
  vec3,
} from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

import { colorSpline } from '@/gl/nodes/color-spline'
import { CREAM, SPIDER_BLUE, SPIDER_MAGENTA } from '@/gl/palette'

/**
 * Banded toon shading in the post-cartoon-iii mould: cel-stepped key light,
 * a flat clipped specular, a cool rim from the opposite side — computed
 * against fixed light directions rather than scene lights, so the bands are
 * stable and the scene needs no light objects at all. The albedo keeps the
 * sketch's noise-driven colour spline, so blotches of the ramp still belong
 * to the object in world space.
 */

// Same reasoning as before: world-space noise so rotation carries the
// colouring with the mesh.
const NOISE_SCALE = 2.5
const CONTRAST_EDGE = 0.5

// The film's cross lighting: warm key from screen right and above, cool rim
// from screen left and below. Normalized by hand.
const KEY_DIR = vec3(0.55, 0.45, 0.7).normalize()
const RIM_DIR = vec3(-0.7, -0.2, 0.25).normalize()

/** Cel bands on the key light. Three fills: shadow, half-tone, lit. */
const BANDS = 3
/** Shadow floor so unlit faces keep colour for the post chain to hatch. */
const AMBIENT = 0.35
const KEY_GAIN = 0.9

/** Cosine cut for the specular hotspot — hard clip, flat white, cartoon. */
const SPECULAR_CUT = 0.97
const SPECULAR_STRENGTH = 0.9

/** Cool bounce strength on the rim-lit side. */
const RIM_LIGHT_STRENGTH = 0.5

/** Fresnel cut for the magenta edge glow. */
const FRESNEL_CUT = 0.75
const FRESNEL_STRENGTH = 0.6

export function createSpiderVerseMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()

  const noise = mx_noise_float(positionWorld.mul(NOISE_SCALE)).mul(0.5).add(0.5)
  const ramp = smoothstep(0.5 - CONTRAST_EDGE, 0.5 + CONTRAST_EDGE, noise)
  const albedo = colorSpline(ramp)

  const n = normalWorld
  const viewDir = cameraPosition.sub(positionWorld).normalize()

  // Cel-stepped diffuse: quantize N·L into flat fills.
  const key = n.dot(KEY_DIR).max(0)
  const band = key.mul(BANDS).floor().div(BANDS)
  const lit = albedo.mul(band.mul(KEY_GAIN).add(AMBIENT))

  // Cool bounce where the rim light lands.
  const rim = n.dot(RIM_DIR).max(0).pow(2)
  const withRim = lit.add(SPIDER_BLUE.mul(rim.mul(RIM_LIGHT_STRENGTH)))

  // Flat clipped specular off the key.
  const halfway = KEY_DIR.add(viewDir).normalize()
  const specular = step(SPECULAR_CUT, n.dot(halfway).max(0))
  // mix() called positionally on purpose: the .mix() chain method takes the receiver as the blend factor, not the base colour.
  const withSpecular = mix(withRim, CREAM, specular.mul(SPECULAR_STRENGTH))

  // Magenta fresnel edge — the seam colour of the palette.
  const fresnel = n.dot(viewDir).max(0).oneMinus()
  const edge = step(FRESNEL_CUT, fresnel)
  material.colorNode = mix(withSpecular, SPIDER_MAGENTA, edge.mul(FRESNEL_STRENGTH))

  return material
}
