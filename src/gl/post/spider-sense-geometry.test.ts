import { describe, expect, it } from 'vitest'

import {
  GESTURE_CAPSULES,
  capsuleDistance,
  capsuleOpacity,
  pointedWaveWidthRatio,
  type GestureCapsule,
} from '@/gl/post/spider-sense-geometry'

const STANDARD_CAPSULE: GestureCapsule = {
  center: [0, 0],
  angle: 0,
  halfLength: 2,
  halfWidth: 1,
  feather: 0.25,
}

describe('gestural spider-sense geometry', () => {
  it('uses six valid local capsule windows', () => {
    expect(GESTURE_CAPSULES).toHaveLength(6)

    for (const capsule of GESTURE_CAPSULES) {
      expect(capsule.halfLength).toBeGreaterThan(0)
      expect(capsule.halfWidth).toBeGreaterThan(0)
      expect(capsule.feather).toBeGreaterThan(0)
      expect(capsule.feather).toBeLessThan(capsule.halfWidth)
    }
  })

  it('measures distance from the rounded capsule centreline', () => {
    expect(capsuleDistance([0, 0], STANDARD_CAPSULE)).toBe(0)
    expect(capsuleDistance([0, 1], STANDARD_CAPSULE)).toBe(1)
    expect(capsuleDistance([3, 0], STANDARD_CAPSULE)).toBe(1)
    expect(capsuleDistance([3, 1], STANDARD_CAPSULE)).toBeCloseTo(
      Math.SQRT2,
      6
    )
  })

  it('feathers opacity beyond the semicircular cap', () => {
    expect(capsuleOpacity([2, 0], STANDARD_CAPSULE)).toBe(1)
    expect(capsuleOpacity([3.125, 0], STANDARD_CAPSULE)).toBeGreaterThan(0)
    expect(capsuleOpacity([3.125, 0], STANDARD_CAPSULE)).toBeLessThan(1)
    expect(capsuleOpacity([3.25, 0], STANDARD_CAPSULE)).toBe(0)
  })
})

describe('pointed travelling-wave profile', () => {
  it.each([
    [0, 1],
    [0.25, 0.75],
    [-0.25, 0.75],
    [0.5, 0],
    [-0.5, 0],
    [0.75, 0],
  ])('maps along position %s to width ratio %s', (along, expected) => {
    expect(pointedWaveWidthRatio(along, 1)).toBe(expected)
  })

  it('rejects a non-positive wave length', () => {
    expect(() => pointedWaveWidthRatio(0, 0)).toThrow(
      'Wave length must be positive'
    )
  })
})
