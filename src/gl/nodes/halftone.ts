import {
  cos,
  dFdx,
  dFdy,
  float,
  Fn,
  fract,
  length,
  mat2,
  max,
  sin,
  sqrt,
  step,
  vec2,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * The two screening patterns from spite/sketch (MIT) —
 * `post-cartoon-iii/post.js`. Dark and mid tones get ruled lines; light tones
 * get halftone dots.
 */

const TAU = 6.28318530718

/** Rotates a uv about the origin, `degrees` clockwise. */
export const rotateUv = Fn(([uv, degrees]: [Node<'vec2'>, Node<'float'>]) => {
  const angle = degrees.mul(TAU / 360)
  const s = sin(angle)
  const c = cos(angle)
  return mat2(c, s.negate(), s, c).mul(uv)
})

/**
 * Ruled hatching. A sine ridge across x, thresholded against the tone `l` so
 * darker pixels widen the stroke until the lines close up into solid ink.
 *
 * The `smoothstep` half-width comes from the screen-space derivative of the
 * scaled uv, which is what keeps the lines from aliasing as they shrink.
 */
export const lines = Fn(
  ([l, uv, resolution, thickness]: [
    Node<'float'>,
    Node<'vec2'>,
    Node<'vec2'>,
    Node<'float'>,
  ]) => {
    const scaled = uv.mul(resolution)
    const ridge = sin(scaled.x.mul(0.5)).mul(0.5).add(0.5)
    const value = ridge.add(thickness).mul(l)
    const e = length(vec2(dFdx(scaled.x), dFdy(scaled.y)))
    return value.smoothstep(float(0.5).sub(e), float(0.5).add(e))
  }
)

/**
 * CMYK-style halftone dots on a 45-degree grid, adapted in the original from
 * libretro's `cmyk-halftone-dot.glsl`. Returns 1 inside a dot.
 *
 * `l` above `threshold` grows the dot radius, so the brightest areas blow out
 * to solid white.
 *
 * The original only ever calls this inside `if (l > light)`, so it takes the
 * square root of `l - threshold` unguarded. Evaluating it unconditionally makes
 * that difference negative for dark pixels, and `sqrt` of a negative is NaN —
 * which survives being multiplied by a zero mask and poisons the pixel. Hence
 * the `max`.
 */
export const halftoneDots = Fn(
  ([l, uv, threshold, scale, thickness]: [
    Node<'float'>,
    Node<'vec2'>,
    Node<'float'>,
    Node<'float'>,
    Node<'float'>,
  ]) => {
    const frequency = 0.05
    const rotation = mat2(0.707, 0.707, -0.707, 0.707)
    const grid = rotation.mul(uv).mul(scale.mul(frequency))
    const cell = fract(grid).mul(2).sub(1).mul(thickness)
    return step(0, sqrt(max(l.sub(threshold), 0)).sub(length(cell)))
  }
)
