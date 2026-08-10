import { describe, expect, it } from 'vitest'

import { PRIORITY, Ticker } from '@/gl/ticker'

describe('Ticker', () => {
  it('runs slots in ascending priority order regardless of add order', () => {
    const order: string[] = []
    const ticker = new Ticker()
    ticker.add(() => order.push('render'), PRIORITY.RENDER)
    ticker.add(() => order.push('update'), PRIORITY.UPDATE)

    ticker.tick(0.016)

    expect(order).toEqual(['update', 'render'])
  })

  it('passes dt to every slot', () => {
    const seen: number[] = []
    const ticker = new Ticker()
    ticker.add((dt) => seen.push(dt))

    ticker.tick(0.02)

    expect(seen).toEqual([0.02])
  })

  it('stops calling a slot after its remove function runs', () => {
    let calls = 0
    const ticker = new Ticker()
    const remove = ticker.add(() => {
      calls += 1
    })

    ticker.tick(0.016)
    remove()
    ticker.tick(0.016)

    expect(calls).toBe(1)
  })
})
