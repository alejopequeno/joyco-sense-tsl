import { describe, expect, it } from 'vitest'

import { Disposer } from '@/gl/dispose'

describe('Disposer', () => {
  it('unwinds teardowns newest-first', () => {
    const order: string[] = []
    const disposer = new Disposer()
    disposer.add(() => order.push('first'))
    disposer.add(() => order.push('second'))
    disposer.add(() => order.push('third'))

    disposer.dispose()

    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('does not run a teardown twice across repeated disposes', () => {
    let calls = 0
    const disposer = new Disposer()
    disposer.add(() => {
      calls += 1
    })

    disposer.dispose()
    disposer.dispose()

    expect(calls).toBe(1)
  })
})
