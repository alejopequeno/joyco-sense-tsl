import { fract, length, mix, screenSize, screenUV, smoothstep, step, vec2, vec3 } from 'three/tsl'
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu'

/**
 * The flat graphic field the logo sits against: a blue-to-red split with a
 * Ben-Day dot lattice over it, the way the film stages Miles against solid
 * colour rather than a rendered environment.
 *
 * Unlit on purpose. It carries no normal variation, so the contour pass leaves
 * it alone and only outlines the logo — which is what keeps the silhouette
 * reading as ink rather than everything picking up an edge.
 */

const SPIDER_BLUE = vec3(0.09, 0.13, 0.62)
const SPIDER_RED = vec3(0.78, 0.06, 0.14)

// Where the two fields meet, and how hard. A tight ramp keeps it graphic
// instead of reading as a soft gradient.
const SPLIT_CENTER = 0.5
const SPLIT_SOFTNESS = 0.28

// Dot lattice, in pixels.
const DOT_SPACING = 26
const DOT_RADIUS = 0.3
const DOT_LIFT = 0.35

// Far enough back to clear the logo's rotation, large enough to cover the
// frustum at that distance on any reasonable aspect ratio.
const BACKDROP_DISTANCE = 6
const BACKDROP_SIZE = 40

export function createBackdrop(): Mesh {
  const material = new MeshBasicNodeMaterial()

  const field = mix(
    SPIDER_BLUE,
    SPIDER_RED,
    smoothstep(SPLIT_CENTER - SPLIT_SOFTNESS, SPLIT_CENTER + SPLIT_SOFTNESS, screenUV.x)
  )

  // Screen-space lattice, so the dots stay a constant size on screen the way
  // printed halftone does — they belong to the page, not to the geometry.
  const cell = fract(screenUV.mul(screenSize).div(DOT_SPACING)).sub(vec2(0.5))
  const dot = step(length(cell), DOT_RADIUS)

  material.colorNode = mix(field, field.add(DOT_LIFT), dot)

  const backdrop = new Mesh(new PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE), material)
  backdrop.position.z = -BACKDROP_DISTANCE
  return backdrop
}
