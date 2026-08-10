import { Fn, min, mix, oneMinus } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Photoshop-style blend modes, ported from spite/sketch (MIT):
 * `shaders/blend-darken.js` and `shaders/blend-screen.js`.
 *
 * Both take an `opacity` and fade back to `base`, which in the original is a
 * third GLSL overload. TSL has no overloading, so opacity is always explicit.
 */

/** Keeps the darker of the two, per channel. */
export const blendDarken = Fn(
  ([base, blend, opacity]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>]) =>
    mix(base, min(base, blend), opacity)
)

/** Inverse-multiply: always lightens, never clips past white. */
export const blendScreen = Fn(
  ([base, blend, opacity]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>]) =>
    mix(base, oneMinus(oneMinus(base).mul(oneMinus(blend))), opacity)
)
