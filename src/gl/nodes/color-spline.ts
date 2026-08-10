import { float, Fn, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Catmull-Rom colour ramp, ported from spite/sketch (MIT) —
 * `post-cartoon-iii/Material.js`, itself adapted from
 * https://www.shadertoy.com/view/ltfXR4
 *
 * The GLSL original indexes a `vec3 p[7]` array with a value computed at
 * runtime. TSL has no dynamic array indexing without a storage buffer, so the
 * segments are unrolled instead: five stops means four spans, each blended in
 * by its own weight. Same curve, no indirection.
 */

// The Spider-Verse palette: deep violet, near-black wine, salmon, pale
// lavender, dusty blue.
const STOPS = [
  vec3(64 / 255, 55 / 255, 124 / 255),
  vec3(34 / 255, 17 / 255, 27 / 255),
  vec3(212 / 255, 109 / 255, 97 / 255),
  vec3(217 / 255, 211 / 255, 229 / 255),
  vec3(112 / 255, 127 / 255, 183 / 255),
] as const

const SEGMENTS = STOPS.length

/** Wraps an index so the ramp loops seamlessly, matching the original's `wrap`. */
function stop(index: number): Node<'vec3'> {
  return STOPS[((index % SEGMENTS) + SEGMENTS) % SEGMENTS]
}

/** The Catmull-Rom basis for one span, evaluated at local parameter `t`. */
function segment(index: number, t: Node<'float'>): Node<'vec3'> {
  const p0 = stop(index - 1)
  const p1 = stop(index)
  const p2 = stop(index + 1)
  const p3 = stop(index + 2)

  return p1
    .mul(2)
    .add(p2.sub(p0).mul(t))
    .add(p0.mul(2).sub(p1.mul(5)).add(p2.mul(4)).sub(p3).mul(t.mul(t)))
    .add(p0.negate().add(p1.mul(3)).sub(p2.mul(3)).add(p3).mul(t.mul(t).mul(t)))
    .mul(0.5)
}

export const colorSpline = Fn(([t]: [Node<'float'>]) => {
  // Clamped just short of 1 so `t = 1` lands inside the last span rather than
  // one past it, where every weight would be zero and the ramp would go black.
  const d = t.clamp(0, 0.9999).mul(SEGMENTS)
  const local = d.fract()

  // Sum every span, each weighted by whether `d` falls inside it. Cheaper than
  // it looks — five constant-folded polynomials and five compares.
  let result: Node<'vec3'> = vec3(0)
  for (let index = 0; index < SEGMENTS; index++) {
    const inside = d.greaterThanEqual(float(index)).and(d.lessThan(float(index + 1)))
    result = result.add(segment(index, local).mul(inside.select(float(1), float(0))))
  }
  return result
})
