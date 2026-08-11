import { describe, expect, it } from 'vitest'

import { balancedReduce, discSampleOffsets } from '@/gl/nodes/morphology'

describe('discSampleOffsets', () => {
  it('places two angular rings at half and full radius', () => {
    const offsets = discSampleOffsets(10, 4)

    expect(offsets).toHaveLength(8)
    expect(offsets.slice(0, 4)).toEqual([
      [5, 0],
      [0, 5],
      [-5, 0],
      [0, -5],
    ])
    expect(offsets.slice(4)).toEqual([
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ])
  })

  it('rejects a tap count that cannot form a disc', () => {
    expect(() => discSampleOffsets(5, 2)).toThrow(
      'Disc dilation requires at least three taps'
    )
  })
})

describe('balancedReduce', () => {
  it('keeps a 129-sample shader expression below recursive parser depth', () => {
    type DepthNode = { depth: number }
    const leaves: readonly DepthNode[] = Array.from({ length: 129 }, () => ({
      depth: 0,
    }))

    const result = balancedReduce(leaves, (left, right) => ({
      depth: Math.max(left.depth, right.depth) + 1,
    }))

    expect(result.depth).toBeLessThanOrEqual(8)
  })
})
