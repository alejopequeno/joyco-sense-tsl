import { ExtrudeGeometry, Mesh } from 'three/webgpu'

import { createLogoShape } from '@/gl/logo/logo-shape'
import { createSpiderVerseMaterial } from '@/gl/materials/spider-verse-material'

// All fractions of the logo's height, which `createLogoShape` normalizes to 1.
export const LOGO_DEPTH = 0.2
export const LOGO_BEVEL_THICKNESS = 0.012
const LOGO_BEVEL_SIZE = 0.012
const LOGO_BEVEL_SEGMENTS = 3

export function createLogoGeometry(): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(createLogoShape(), {
    depth: LOGO_DEPTH,
    bevelEnabled: true,
    // Without a bevel the extrusion reads as a flat sticker — the chamfer is
    // what catches light along every edge.
    bevelThickness: LOGO_BEVEL_THICKNESS,
    bevelSize: LOGO_BEVEL_SIZE,
    bevelSegments: LOGO_BEVEL_SEGMENTS,
    // Every segment of the outline is straight, so curve subdivision would
    // only add vertices.
    curveSegments: 1,
  })
  // ExtrudeGeometry builds forward from z = 0, leaving the whole solid in front
  // of the origin. Recentre it or the drag rotation orbits an off-centre pivot.
  geometry.translate(0, 0, -LOGO_DEPTH / 2)
  return geometry
}

export function createLogoMesh(): Mesh {
  return new Mesh(createLogoGeometry(), createSpiderVerseMaterial())
}
