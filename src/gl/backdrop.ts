import type { FolderApi } from '@tweakpane/core'
import {
  float,
  mix,
  mrt,
  mx_noise_float,
  screenSize,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu'

import { CREAM, SPIDER_BLUE, SPIDER_RED } from '@/gl/palette'

/**
 * The field the logo sits against: soft blobby patches of the film's duotone,
 * post-cartoon-iii style. Unlit and normal-flat on purpose, so the contour
 * pass leaves it alone; the screening layers in the post chain are what turn
 * its bright patches into Ben-Day dots and its dark ones into hatching.
 */

// Noise frequencies over aspect-corrected screen space. Low: a handful of
// blobs across the frame, not a texture.
const DUOTONE_SCALE = 1.4
const PATCH_SCALE = 1.1
// Decorrelates the cream patches from the duotone blobs.
const PATCH_OFFSET = 31.7

// How hard the blue and red fields cut against each other. Tight enough to
// stay graphic, soft enough not to alias.
const DUOTONE_EDGE_LOW = 0.38
const DUOTONE_EDGE_HIGH = 0.62

// Cream patches: where the noise crests, the page shows through. The post
// chain's halftone threshold sits at 0.62 luma, so a 0.85 lift is comfortably
// inside dot territory.
const PATCH_EDGE_LOW = 0.55
const PATCH_EDGE_HIGH = 0.85

// Far enough back to clear the logo's rotation, large enough to cover the
// frustum at that distance on any reasonable aspect ratio.
const BACKDROP_DISTANCE = 6
const BACKDROP_SIZE = 40

export type Backdrop = {
  mesh: Mesh
  registerDebug(folder: FolderApi): void
}

export function createBackdrop(): Backdrop {
  const material = new MeshBasicNodeMaterial()

  // The film palette at print strength: pulled toward the paper so the field
  // reads as suit red/blue over paper, not poster-saturated. Uniforms (not
  // bare numbers) so `registerDebug` can bind them live.
  const blueSoften = uniform(0.08)
  const redSoften = uniform(0.12)
  const patchLift = uniform(0.55)

  // Aspect-corrected so blobs stay round on wide screens.
  const p = screenUV.mul(vec2(screenSize.x.div(screenSize.y), 1))

  const duotoneNoise = mx_noise_float(vec3(p.mul(DUOTONE_SCALE), 0)).mul(0.5).add(0.5)
  const duotone = mix(
    mix(SPIDER_BLUE, CREAM, blueSoften),
    mix(SPIDER_RED, CREAM, redSoften),
    smoothstep(DUOTONE_EDGE_LOW, DUOTONE_EDGE_HIGH, duotoneNoise)
  )

  const patchNoise = mx_noise_float(vec3(p.mul(PATCH_SCALE).add(PATCH_OFFSET), 0))
    .mul(0.5)
    .add(0.5)
  const lift = smoothstep(PATCH_EDGE_LOW, PATCH_EDGE_HIGH, patchNoise)

  material.colorNode = mix(duotone, CREAM, lift.mul(patchLift))
  // The silhouette mask the spider-sense contour dilates: the backdrop is
  // "off", everything else inherits the pass default of 1.
  material.mrtNode = mrt({ mask: float(0) })

  const mesh = new Mesh(new PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE), material)
  mesh.position.z = -BACKDROP_DISTANCE

  return {
    mesh,
    registerDebug(folder: FolderApi): void {
      folder.addBinding(blueSoften, 'value', { label: 'blue soften', min: 0, max: 1 })
      folder.addBinding(redSoften, 'value', { label: 'red soften', min: 0, max: 1 })
      folder.addBinding(patchLift, 'value', { label: 'patch lift', min: 0, max: 1 })
    },
  }
}
