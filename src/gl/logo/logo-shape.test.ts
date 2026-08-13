import { describe, expect, it } from 'vitest'

import { createLogoShape } from '@/gl/logo/logo-shape'

function bounds(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

describe('createLogoShape', () => {
  it('is centered on the origin', () => {
    const { minX, maxX, minY, maxY } = bounds(createLogoShape().getPoints())
    expect(minX + maxX).toBeCloseTo(0, 6)
    expect(minY + maxY).toBeCloseTo(0, 6)
  })

  it('is normalized to a width of 1.6, preserving the viewBox aspect', () => {
    const { minX, maxX, minY, maxY } = bounds(createLogoShape().getPoints())
    expect(maxX - minX).toBeCloseTo(1.6, 6)
    expect(maxY - minY).toBeCloseTo((144 / 352) * 1.6, 6)
  })

  it('has the 13 corners of the source path', () => {
    // `closePath` repeats the first point, so the closed outline is 14 entries.
    expect(createLogoShape().getPoints()).toHaveLength(14)
  })
})
