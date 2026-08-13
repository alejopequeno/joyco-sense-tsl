import { describe, expect, it } from 'vitest'

import {
  AUTO_CYCLE_SECONDS,
  BURST_HOLD_SECONDS,
  HeroDirector,
  SWAP_AT_INTENSITY,
} from '@/gl/hero/hero-director'

/** Steps the director with a constant intensity until just past `seconds`. */
function idleFor(director: HeroDirector, seconds: number, intensity = 0) {
  let last = { boost: false, swap: false }
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    last = director.update(dt, intensity, false, false)
  }
  return last
}

describe('HeroDirector', () => {
  it('stays quiet before the auto-cycle time', () => {
    const director = new HeroDirector()
    const last = idleFor(director, AUTO_CYCLE_SECONDS - 0.5)
    expect(last.boost).toBe(false)
    expect(last.swap).toBe(false)
  })

  it('boosts after the auto-cycle idle time', () => {
    const director = new HeroDirector()
    const last = idleFor(director, AUTO_CYCLE_SECONDS + 0.1)
    expect(last.boost).toBe(true)
  })

  it('holds the boost for the burst duration, then drops it', () => {
    const director = new HeroDirector()
    idleFor(director, AUTO_CYCLE_SECONDS + 0.1)
    const during = idleFor(director, BURST_HOLD_SECONDS - 0.3, 1)
    expect(during.boost).toBe(true)
    const after = idleFor(director, 0.5, 1)
    expect(after.boost).toBe(false)
  })

  it('swaps exactly once, on the rising cross of the threshold', () => {
    const director = new HeroDirector()
    idleFor(director, AUTO_CYCLE_SECONDS + 0.1)
    // Envelope climbing: below, below, cross, above.
    expect(director.update(1 / 60, 0.3, false, false).swap).toBe(false)
    expect(director.update(1 / 60, 0.7, false, false).swap).toBe(false)
    expect(director.update(1 / 60, SWAP_AT_INTENSITY + 0.02, false, false).swap).toBe(true)
    expect(director.update(1 / 60, 0.95, false, false).swap).toBe(false)
  })

  it('dragging resets the idle clock and never swaps', () => {
    const director = new HeroDirector()
    idleFor(director, AUTO_CYCLE_SECONDS - 0.5)
    // A long drag at full intensity: no boost, no swap.
    let swapped = false
    for (let t = 0; t < AUTO_CYCLE_SECONDS; t += 1 / 60) {
      const out = director.update(1 / 60, 1, true, false)
      swapped ||= out.swap
      expect(out.boost).toBe(false)
    }
    expect(swapped).toBe(false)
    // And the idle clock restarted: still quiet shortly after release.
    const last = idleFor(director, 1)
    expect(last.boost).toBe(false)
  })

  it('a tap never swaps the hero, even as its burst climbs the threshold', () => {
    const director = new HeroDirector()
    // Pose begins (tap): intensity starts low and climbs past the threshold.
    expect(director.update(1 / 60, 0.1, false, true).swap).toBe(false)
    expect(director.update(1 / 60, 0.5, false, true).swap).toBe(false)
    expect(director.update(1 / 60, 0.9, false, true).swap).toBe(false)
    expect(director.update(1 / 60, 0.95, false, true).swap).toBe(false)
  })

  it('a tap while the envelope is hot still never swaps', () => {
    const director = new HeroDirector()
    expect(director.update(1 / 60, 0.95, false, true).swap).toBe(false)
  })

  it('a drag cancels a pending triggered swap', () => {
    const director = new HeroDirector({ autoCycle: false })
    director.trigger()
    director.update(1 / 60, 0.1, false, false) // consumed: bursting + armed
    director.update(1 / 60, 0.3, true, false) // drag starts — arm forgotten
    director.update(1 / 60, 0.5, false, false)
    expect(director.update(1 / 60, 0.9, false, false).swap).toBe(false)
  })

  it('a hot trigger consumes any pending arm', () => {
    const director = new HeroDirector({ autoCycle: false })
    director.trigger()
    director.update(1 / 60, 0.1, false, false) // consumed low: arm pending
    // Second trigger while hot: fires once, and the stale arm must not fire
    // again on the next unrelated cross.
    director.trigger()
    expect(director.update(1 / 60, 0.95, false, false).swap).toBe(true)
    director.update(1 / 60, 0.5, false, false)
    expect(director.update(1 / 60, 0.9, false, false).swap).toBe(false)
  })

  it('never auto-bursts with autoCycle off', () => {
    const director = new HeroDirector({ autoCycle: false })
    const last = idleFor(director, AUTO_CYCLE_SECONDS * 3)
    expect(last.boost).toBe(false)
    expect(last.swap).toBe(false)
  })

  it('trigger() runs the full burst-and-swap even with autoCycle off', () => {
    const director = new HeroDirector({ autoCycle: false })
    director.trigger()
    expect(director.update(1 / 60, 0, false, false).boost).toBe(true)
    // Envelope climbing under the boost: swap fires on the cross.
    expect(director.update(1 / 60, 0.5, false, false).swap).toBe(false)
    expect(director.update(1 / 60, 0.9, false, false).swap).toBe(true)
  })

  it('trigger() while the envelope is hot swaps immediately', () => {
    const director = new HeroDirector({ autoCycle: false })
    director.trigger()
    expect(director.update(1 / 60, 0.95, false, false).swap).toBe(true)
  })
})
