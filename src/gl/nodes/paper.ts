import { Fn, mix, mx_fractal_noise_float, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * Procedural stand-in for the paper scan the original sketch samples
 * (spite/sketch, MIT — `js/params.js` loads a Parchment bitmap). Generating it
 * keeps the project free of image assets, and the grain is resolution
 * independent for free.
 *
 * Returned as a brightness multiplier rather than the sketch's beige sheet
 * colour: the film look this project is chasing is saturated and dark, and
 * blending a warm off-white over it under `blendDarken` desaturated everything
 * toward newsprint. The tooth survives, the paper tint does not.
 */

// Fine tooth of the sheet.
const GRAIN_SCALE = 220
const GRAIN_OCTAVES = 4
// Long fibres: the same noise stretched hard along one axis.
const FIBRE_SCALE = 40
const FIBRE_STRETCH = 12
const FIBRE_WEIGHT = 0.45

// How far the grain is allowed to swing the image. Small — it should read as
// texture on a surface, never as noise laid over one.
const GRAIN_FLOOR = 0.88
const GRAIN_CEILING = 1.04

/**
 * @param uv screen-space coordinates, already scaled by the caller so the grain
 *           holds a constant physical size regardless of viewport.
 */
export const printGrain = Fn(([uv]: [Node<'vec2'>]) => {
  const grain = mx_fractal_noise_float(
    vec3(uv.mul(GRAIN_SCALE), 0),
    GRAIN_OCTAVES,
    2,
    0.5,
    1
  )
    .mul(0.5)
    .add(0.5)

  const fibres = mx_fractal_noise_float(
    vec3(uv.mul(vec2(FIBRE_SCALE * FIBRE_STRETCH, FIBRE_SCALE)), 0),
    2,
    2,
    0.5,
    1
  )
    .mul(0.5)
    .add(0.5)

  return mix(GRAIN_FLOOR, GRAIN_CEILING, mix(grain, fibres, FIBRE_WEIGHT))
})
