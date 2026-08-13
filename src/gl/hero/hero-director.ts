/**
 * Decides when the hero mesh swaps and when the spider-sense envelope is
 * forced on so the swap can hide inside the flash. Pure state machine: the
 * scene feeds it time, the current envelope intensity and the interaction
 * flags; it answers "should the envelope burn" and "swap now". The swap
 * fires on the intensity's rising cross of the threshold, so the cut always
 * lands while the overlay is near full blast.
 */

/** Seconds of quiet before an automatic burst-and-swap. */
export const AUTO_CYCLE_SECONDS = 6
/** How long an automatic burst holds the envelope on. */
export const BURST_HOLD_SECONDS = 1.2
/** The swap fires when intensity first climbs past this. */
export const SWAP_AT_INTENSITY = 0.85

export class HeroDirector {
  private readonly autoCycle: boolean
  private triggered = false
  private idle = 0
  private bursting = false
  private burstTimer = 0
  private armed = false
  private wasPosing = false
  private wasDragging = false
  private previousIntensity = 0

  constructor(options: { autoCycle?: boolean } = {}) {
    this.autoCycle = options.autoCycle ?? true
  }

  /** Queues a manual burst-and-swap, consumed on the next update. */
  trigger(): void {
    this.triggered = true
  }

  update(
    dt: number,
    intensity: number,
    dragging: boolean,
    posing: boolean
  ): { boost: boolean; swap: boolean } {
    let swap = false

    // Dragging means the user moved on — forget any pending gesture.
    if (dragging && !this.wasDragging) this.armed = false
    this.wasDragging = dragging

    // A tap (pose start) arms a swap. If the envelope is already hot from a
    // previous burst the rising cross will never come — fire immediately.
    if (posing && !this.wasPosing) {
      if (intensity >= SWAP_AT_INTENSITY) {
        swap = true
        this.armed = false
      } else this.armed = true
    }
    this.wasPosing = posing

    // The idle clock only runs while nothing else is going on.
    if (dragging || posing || this.bursting) this.idle = 0
    else this.idle += dt

    const autoFire = this.autoCycle && this.idle >= AUTO_CYCLE_SECONDS
    if (autoFire || this.triggered) {
      this.triggered = false
      this.bursting = true
      this.burstTimer = 0
      this.idle = 0
      if (intensity >= SWAP_AT_INTENSITY) {
        swap = true
        this.armed = false
      } else this.armed = true
    }

    if (this.bursting) {
      this.burstTimer += dt
      if (this.burstTimer >= BURST_HOLD_SECONDS) this.bursting = false
    }

    // Dragging is the user inspecting the hero — never steal the mesh then.
    if (this.armed && !dragging) {
      const crossed =
        intensity >= SWAP_AT_INTENSITY && this.previousIntensity < SWAP_AT_INTENSITY
      if (crossed) {
        swap = true
        this.armed = false
      }
    }
    this.previousIntensity = intensity

    return { boost: this.bursting, swap }
  }
}
