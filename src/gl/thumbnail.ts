import { PRIORITY, type Ticker } from '@/gl/ticker'

const THUMBNAIL_PARAM = 'thumbnail'

// The first frame compiles every pipeline; a couple more let the spheres and
// the sense envelope settle into a frame worth keeping.
export const THUMBNAIL_FRAMES = 3

/**
 * `?thumbnail` is how the JOYCO hub's screenshot service loads the sketch. It
 * renders on a GPU-less headless Chrome, where each frame costs seconds, so
 * the sketch draws a few frames, freezes, and flags itself ready.
 */
export function isThumbnailRequest(search: string): boolean {
  return new URLSearchParams(search).has(THUMBNAIL_PARAM)
}

/**
 * Counts rendered frames from a slot after the render one, then stops the
 * ticker and fires `onFrozen` once. Call it only after the render slot exists,
 * or the count includes frames that never reached the canvas.
 */
export function freezeAfterFrames(
  ticker: Ticker,
  frames: number,
  onFrozen: () => void,
): () => void {
  let rendered = 0
  const remove = ticker.add(() => {
    rendered += 1
    if (rendered < frames) return
    remove()
    ticker.stop()
    onFrozen()
  }, PRIORITY.RENDER + 1)
  return remove
}

/** The hook the screenshot service waits on, via `waitForSelector`. */
export function markReady(root: HTMLElement): void {
  root.dataset.ready = ''
}
