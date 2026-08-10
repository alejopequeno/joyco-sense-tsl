import { sqrt, vec2 } from 'three/tsl'
import type { Node, TextureNode } from 'three/webgpu'

/**
 * 3x3 Sobel operator, ported from spite/sketch (MIT) — `shaders/sobel.js`.
 *
 * Deliberately a plain TypeScript function rather than an `Fn`: it has to call
 * `sample()` on the texture, and a texture is not something TSL can pass
 * through a function signature.
 *
 * @param source     texture to read — typically the pass's normal buffer.
 * @param uv         where to evaluate the operator.
 * @param texelSize  1 / resolution, so the taps land on neighbouring pixels.
 * @param width      spreads the taps further apart, thickening the edge.
 */
export function sobel(
  source: TextureNode,
  uv: Node<'vec2'>,
  texelSize: Node<'vec2'>,
  width: Node<'float'>
): Node<'vec4'> {
  const offset = texelSize.mul(width)
  const at = (x: number, y: number): Node<'vec4'> =>
    source.sample(uv.add(offset.mul(vec2(x, y))))

  const horizontal = at(1, -1)
    .add(at(1, 0).mul(2))
    .add(at(1, 1))
    .sub(at(-1, -1))
    .sub(at(-1, 0).mul(2))
    .sub(at(-1, 1))

  const vertical = at(-1, 1)
    .add(at(0, 1).mul(2))
    .add(at(1, 1))
    .sub(at(-1, -1))
    .sub(at(0, -1).mul(2))
    .sub(at(1, -1))

  return sqrt(horizontal.mul(horizontal).add(vertical.mul(vertical)))
}
