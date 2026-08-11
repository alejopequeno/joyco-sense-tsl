import { describe, expect, it } from 'vitest'

import {
  clampPitch,
  decayVelocity,
  MAX_PITCH,
  poseStep,
  shortestAngleDelta,
} from '@/gl/logo/drag-rotate'

describe('clampPitch', () => {
  it('leaves pitch inside the limit untouched', () => {
    expect(clampPitch(0.3)).toBeCloseTo(0.3, 6)
  })

  it('clamps both directions to the limit', () => {
    expect(clampPitch(10)).toBeCloseTo(MAX_PITCH, 6)
    expect(clampPitch(-10)).toBeCloseTo(-MAX_PITCH, 6)
  })
})

describe('decayVelocity', () => {
  it('is frame-rate independent', () => {
    // One 32ms step must land where two 16ms steps do. A per-frame
    // `v *= 0.95` fails this, which is the whole reason for the exponential.
    const oneBigStep = decayVelocity(1, 0.032)
    const twoSmallSteps = decayVelocity(decayVelocity(1, 0.016), 0.016)
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 10)
  })

  it('decays toward zero without crossing it', () => {
    expect(decayVelocity(1, 1)).toBeLessThan(1)
    expect(decayVelocity(1, 1)).toBeGreaterThan(0)
    expect(decayVelocity(-1, 1)).toBeGreaterThan(-1)
    expect(decayVelocity(-1, 1)).toBeLessThan(0)
  })

  it('does not change velocity across a zero-length step', () => {
    expect(decayVelocity(0.4, 0)).toBeCloseTo(0.4, 10)
  })
})

describe('shortestAngleDelta', () => {
  it('returns the plain difference when it is already short', () => {
    expect(shortestAngleDelta(0.2, 0.5)).toBeCloseTo(0.3, 10)
    expect(shortestAngleDelta(0.5, 0.2)).toBeCloseTo(-0.3, 10)
  })

  it('wraps across the seam instead of going the long way round', () => {
    // From just under a full turn to just past zero: the short path is
    // forward through the seam, not backward through almost 2π.
    expect(shortestAngleDelta(6.2, 0.1)).toBeCloseTo(0.1831853, 5)
    expect(shortestAngleDelta(0.1, 6.2)).toBeCloseTo(-0.1831853, 5)
  })

  it('never returns more than half a turn either way', () => {
    for (let from = -10; from < 10; from += 0.7) {
      for (let to = -10; to < 10; to += 0.9) {
        expect(Math.abs(shortestAngleDelta(from, to))).toBeLessThanOrEqual(Math.PI)
      }
    }
  })
})

describe('poseStep', () => {
  it('moves toward the target without overshooting', () => {
    const next = poseStep(0, 1, 0.016)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('is frame-rate independent', () => {
    const oneBigStep = poseStep(0, 1, 0.032)
    const twoSmallSteps = poseStep(poseStep(0, 1, 0.016), 1, 0.016)
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 10)
  })

  it('approaches through the wrap seam by the short path', () => {
    // Starting just under a full turn, the step must increase the angle
    // (pushing through 2π toward the target), not decrease it.
    expect(poseStep(6.2, 0.1, 0.1)).toBeGreaterThan(6.2)
  })

  it('does not move across a zero-length step', () => {
    expect(poseStep(0.4, 1, 0)).toBeCloseTo(0.4, 10)
  })
})
