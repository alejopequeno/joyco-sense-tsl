import { describe, expect, it } from 'vitest'

import { senseStep } from '@/gl/post/sense-envelope'

describe('senseStep', () => {
  it('rises toward 1 while active', () => {
    const next = senseStep(0, 0.016, true)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('decays toward 0 while inactive without crossing it', () => {
    const next = senseStep(1, 0.016, false)
    expect(next).toBeLessThan(1)
    expect(next).toBeGreaterThan(0)
  })

  it('is frame-rate independent', () => {
    // One 32ms step must land where two 16ms steps do — same argument as
    // decayVelocity in drag-rotate.
    const oneBigStep = senseStep(0.5, 0.032, false)
    const twoSmallSteps = senseStep(senseStep(0.5, 0.016, false), 0.016, false)
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 10)
  })

  it('does not change across a zero-length step', () => {
    expect(senseStep(0.4, 0, true)).toBeCloseTo(0.4, 10)
    expect(senseStep(0.4, 0, false)).toBeCloseTo(0.4, 10)
  })

  it('attacks fast: near full after a quarter second of dragging', () => {
    let value = 0
    for (let i = 0; i < 15; i++) value = senseStep(value, 1 / 60, true)
    expect(value).toBeGreaterThan(0.9)
  })

  it('decays out in about a second and a half', () => {
    let value = 1
    for (let i = 0; i < 90; i++) value = senseStep(value, 1 / 60, false)
    expect(value).toBeLessThan(0.05)
  })
})
