import { describe, expect, it } from 'vitest'

import { SWAP_FLIP_AT, swapScale } from '@/gl/hero/swap-scale'

describe('swapScale', () => {
  it('rests at full scale on both ends', () => {
    expect(swapScale(0)).toBeCloseTo(1, 6)
    expect(swapScale(1)).toBeCloseTo(1, 6)
  })

  it('collapses to zero at the flip point', () => {
    expect(swapScale(SWAP_FLIP_AT)).toBeCloseTo(0, 6)
  })

  it('anticipates: bulges past 1 shortly after the start', () => {
    expect(swapScale(0.1)).toBeGreaterThan(1)
  })

  it('overshoots: pops past 1 on the way back', () => {
    expect(swapScale(0.75)).toBeGreaterThan(1)
  })

  it('never goes negative', () => {
    for (let p = 0; p <= 1; p += 0.01) {
      expect(swapScale(p)).toBeGreaterThanOrEqual(0)
    }
  })
})
