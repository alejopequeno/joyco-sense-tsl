/**
 * Intensity envelope for the spider-sense overlay: snaps up while the logo is
 * being dragged, bleeds away after release. Exponential in both directions so
 * two 8ms steps land exactly where one 16ms step does — same property, and
 * same reasoning, as `decayVelocity` in drag-rotate.
 */

/** Seconds to close ~63% of the gap to 1 while dragging. Fast — danger snaps. */
const ATTACK_TAU = 0.06
/** Seconds to shed ~63% after release. exp(-1.5/0.35) ≈ 0.014, so the overlay
 * is visually gone about a second and a half after the pointer lets go. */
const DECAY_TAU = 0.35

export function senseStep(value: number, dt: number, active: boolean): number {
  const target = active ? 1 : 0
  const tau = active ? ATTACK_TAU : DECAY_TAU
  return target + (value - target) * Math.exp(-dt / tau)
}
