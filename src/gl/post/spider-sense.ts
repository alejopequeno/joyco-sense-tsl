import {
  abs,
  float,
  Fn,
  fract,
  hash,
  mix,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { SENSE_RED, SPIDER_BLUE } from '@/gl/palette'

/**
 * The film's spider-sense language as a full-screen overlay: jagged red
 * spikes stabbing in from the top and bottom edges, and wavy squiggle lines
 * hanging in the frame. Everything is driven by one intensity value — at 0
 * the overlay is a no-op — and re-randomized a few times a second by
 * quantizing time into flicker steps, which is what makes it vibrate like
 * hand-drawn frames instead of animating smoothly.
 */

/** Columns of spikes across the width. */
const SPIKE_COLUMNS = 48
/** Longest spike reach from the edge, as a fraction of screen height. */
const SPIKE_REACH = 0.32
/** Re-randomizations per second. Comic-book shutter, not smooth motion. */
const FLICKER_HZ = 12
/** Decorrelates the per-column hash between flicker steps. */
const FLICKER_SALT = 77.7

/** Squiggle line count and shape. */
const SQUIGGLE_ROWS = [0.18, 0.42, 0.63, 0.86] as const
const SQUIGGLE_FREQUENCY = 40
const SQUIGGLE_AMPLITUDE = 0.012
const SQUIGGLE_HALF_WIDTH = 0.004
const SQUIGGLE_FEATHER = 0.003
/** Fraction of the width a squiggle segment covers. */
const SQUIGGLE_SPAN = 0.3

/** Fades all masks in as intensity leaves zero, so decay tails vanish clean. */
const GATE_LOW = 0.02
const GATE_HIGH = 0.2

export const spiderSense = Fn(
  ([color, intensity]: [Node<'vec3'>, Node<'float'>]) => {
    const flicker = time.mul(FLICKER_HZ).floor()

    // --- Edge spikes ---------------------------------------------------
    // 0 at the top and bottom edges, 1 at the vertical centre.
    const fromEdge = abs(screenUV.y.mul(2).sub(1)).oneMinus()
    const column = screenUV.x.mul(SPIKE_COLUMNS).floor()
    // Per-column, per-flicker-step random reach.
    const columnSeed = hash(column.add(flicker.mul(FLICKER_SALT)))
    // Triangle profile inside the column: full reach at the centre, zero at
    // the sides — that is what makes each column a spike, not a bar.
    const triangle = abs(fract(screenUV.x.mul(SPIKE_COLUMNS)).mul(2).sub(1)).oneMinus()
    const reach = columnSeed.mul(SPIKE_REACH).mul(intensity).mul(triangle)
    const spike = step(fromEdge, reach)

    // --- Squiggles ------------------------------------------------------
    // Four wavy strokes, alternating red and blue, each jumping to a new
    // horizontal window every flicker step.
    let squiggleRed: Node<'float'> = float(0)
    let squiggleBlue: Node<'float'> = float(0)
    for (const [index, row] of SQUIGGLE_ROWS.entries()) {
      const seed = hash(flicker.add(index * 13.31))
      const start = seed.mul(1 - SQUIGGLE_SPAN)
      const window = step(start, screenUV.x).mul(step(screenUV.x, start.add(SQUIGGLE_SPAN)))
      const wave = sin(screenUV.x.mul(SQUIGGLE_FREQUENCY).add(seed.mul(50))).mul(
        SQUIGGLE_AMPLITUDE
      )
      const line = smoothstep(
        SQUIGGLE_HALF_WIDTH,
        SQUIGGLE_HALF_WIDTH + SQUIGGLE_FEATHER,
        abs(screenUV.y.sub(row).sub(wave))
      )
        .oneMinus()
        .mul(window)
      if (index % 2 === 0) squiggleRed = squiggleRed.add(line)
      else squiggleBlue = squiggleBlue.add(line)
    }

    // --- Composite ------------------------------------------------------
    const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)
    const withSpikes = mix(color, SENSE_RED, spike.mul(gate))
    const withRed = mix(withSpikes, SENSE_RED, squiggleRed.clamp(0, 1).mul(gate))
    return mix(withRed, SPIDER_BLUE, squiggleBlue.clamp(0, 1).mul(gate))
  }
)
