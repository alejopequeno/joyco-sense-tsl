import { length, screenSize, screenUV, vec2, vec4 } from 'three/tsl'
import type { Node, TextureNode } from 'three/webgpu'

/**
 * Radial RGB split, ported from spite/sketch (MIT) —
 * `post-cartoon-iii/post.js`, the sketch's second pass.
 *
 * Red samples inward, blue outward, green stays put, by an offset that grows
 * with distance from screen centre — so the middle stays sharp and the corners
 * fringe.
 *
 * @param source  the already-composited image, sampled at shifted coordinates.
 * @param delta   split strength in pixels at the edge of the frame.
 */
export function chromaticAberration(
  source: TextureNode,
  delta: Node<'float'>
): Node<'vec4'> {
  const direction = screenUV.sub(vec2(0.5))
  // The original computes `length(dir)` scaled by 0.7 and then calls
  // `normalize(dir)` while discarding the result — a no-op left in the source.
  // The offset it actually uses is the raw direction times that distance.
  const offset = direction.mul(length(direction).mul(0.7)).mul(delta)

  // Both taps divide by a single axis, as in the original: the split is very
  // slightly anisotropic, which is part of the look.
  const red = source.sample(screenUV.sub(offset.div(screenSize.x)))
  const green = source.sample(screenUV)
  const blue = source.sample(screenUV.add(offset.div(screenSize.y)))

  return vec4(red.r, green.g, blue.b, 1)
}
