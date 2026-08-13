/**
 * The scale envelope of a hero swap: anticipate (bulge slightly), collapse
 * to zero, flip the shape while invisible, pop back with an elastic
 * overshoot. Classic squash-and-stretch, packed into one 0..1 progress.
 */

/** Whole-transition duration, seconds. The sense burst covers it. */
export const SWAP_SECONDS = 0.7
/** Progress at which scale hits zero — the shape flips here, unseen. */
export const SWAP_FLIP_AT = 0.5

// The standard "back" easing constants (Penner): the c1 pull is what makes
// the ease dip outside 0..1 — read here as anticipation and overshoot.
const BACK_PULL = 1.70158
const BACK_SCALED = BACK_PULL + 1

function easeInBack(t: number): number {
  return BACK_SCALED * t * t * t - BACK_PULL * t * t
}

function easeOutBack(t: number): number {
  const u = t - 1
  return 1 + BACK_SCALED * u * u * u + BACK_PULL * u * u
}

export function swapScale(progress: number): number {
  if (progress <= SWAP_FLIP_AT) {
    return Math.max(1 - easeInBack(progress / SWAP_FLIP_AT), 0)
  }
  return Math.max(easeOutBack((progress - SWAP_FLIP_AT) / (1 - SWAP_FLIP_AT)), 0)
}
