import { describe, expect, it } from 'vitest'

import { selectWaveKeepOutDilation } from '@/gl/post/spider-sense'

describe('selectWaveKeepOutDilation', () => {
  it('keeps waves above the contour by selecting its inner boundary', () => {
    const inner = Symbol('inner')
    const outer = Symbol('outer')

    expect(selectWaveKeepOutDilation({ inner, outer })).toBe(inner)
  })
})
