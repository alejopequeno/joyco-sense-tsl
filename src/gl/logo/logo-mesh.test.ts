import { describe, expect, it } from 'vitest'

import { createLogoGeometry, LOGO_BEVEL_THICKNESS, LOGO_DEPTH } from '@/gl/logo/logo-mesh'

describe('createLogoGeometry', () => {
  it('is centered on Z so the mesh rotates about its own middle', () => {
    const geometry = createLogoGeometry()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) throw new Error('bounding box was not computed')

    const halfDepth = LOGO_DEPTH / 2 + LOGO_BEVEL_THICKNESS
    expect(box.min.z).toBeCloseTo(-halfDepth, 5)
    expect(box.max.z).toBeCloseTo(halfDepth, 5)
  })

  it('stays centered on X and Y after extrusion', () => {
    const geometry = createLogoGeometry()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) throw new Error('bounding box was not computed')

    expect(box.min.x + box.max.x).toBeCloseTo(0, 5)
    expect(box.min.y + box.max.y).toBeCloseTo(0, 5)
  })

  it('grows the silhouette by the bevel size on every side', () => {
    const geometry = createLogoGeometry()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) throw new Error('bounding box was not computed')

    // The shape is 1 unit tall before extrusion; the bevel pushes the outline
    // outward by `bevelSize` on each side.
    expect(box.max.y - box.min.y).toBeGreaterThan(1)
  })
})
