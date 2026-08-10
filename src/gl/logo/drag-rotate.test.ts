import { describe, expect, it } from 'vitest'

import { clampPitch, decayVelocity, MAX_PITCH } from '@/gl/logo/drag-rotate'

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
