export const PRIORITY = {
  UPDATE: 0,
  RENDER: 100,
} as const

// A backgrounded tab resumes with a delta of several seconds. Integrating that
// in one step would fling the drag inertia across dozens of turns, so clamp to
// the equivalent of 30fps and let the animation lag instead.
const MAX_DELTA_SECONDS = 1 / 30

type Slot = {
  readonly callback: (dt: number) => void
  readonly priority: number
}

export class Ticker {
  private readonly slots: Slot[] = []
  private frame = 0
  private last = 0

  add(callback: (dt: number) => void, priority: number = PRIORITY.UPDATE): () => void {
    const slot: Slot = { callback, priority }
    this.slots.push(slot)
    // Array.prototype.sort is stable, so equal priorities keep insertion order.
    this.slots.sort((a, b) => a.priority - b.priority)
    return () => {
      const index = this.slots.indexOf(slot)
      if (index !== -1) this.slots.splice(index, 1)
    }
  }

  /**
   * Public so tests can step the loop without a browser. `start()` is the only
   * caller in the app.
   */
  tick(dt: number): void {
    // Iterate a copy: a slot is allowed to remove itself mid-tick.
    for (const slot of [...this.slots]) slot.callback(dt)
  }

  start(): void {
    if (this.frame !== 0) return
    this.last = performance.now()
    const loop = (now: number): void => {
      this.frame = requestAnimationFrame(loop)
      const dt = Math.min((now - this.last) / 1000, MAX_DELTA_SECONDS)
      this.last = now
      this.tick(dt)
    }
    this.frame = requestAnimationFrame(loop)
  }

  stop(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0
  }
}
