import { describe, expect, it, vi } from 'vitest'

import { freezeAfterFrames, isThumbnailRequest } from '@/gl/thumbnail'
import { PRIORITY, Ticker } from '@/gl/ticker'

describe('isThumbnailRequest', () => {
  it('detects the bare thumbnail flag', () => {
    expect(isThumbnailRequest('?thumbnail')).toBe(true)
  })

  it('detects the flag next to other params', () => {
    expect(isThumbnailRequest('?debug&thumbnail=1')).toBe(true)
  })

  it('ignores a normal visit', () => {
    expect(isThumbnailRequest('')).toBe(false)
    expect(isThumbnailRequest('?debug')).toBe(false)
  })
})

describe('freezeAfterFrames', () => {
  it('fires once after the requested frame count and stops the ticker', () => {
    const ticker = new Ticker()
    const stop = vi.spyOn(ticker, 'stop')
    const onFrozen = vi.fn()
    freezeAfterFrames(ticker, 3, onFrozen)

    ticker.tick(0.016)
    ticker.tick(0.016)
    expect(onFrozen).not.toHaveBeenCalled()

    ticker.tick(0.016)
    ticker.tick(0.016)
    expect(onFrozen).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('counts after the render slot so the frozen frame is already drawn', () => {
    const order: string[] = []
    const ticker = new Ticker()
    freezeAfterFrames(ticker, 1, () => order.push('frozen'))
    ticker.add(() => order.push('render'), PRIORITY.RENDER)

    ticker.tick(0.016)

    expect(order).toEqual(['render', 'frozen'])
  })
})
