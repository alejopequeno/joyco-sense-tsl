import {
  abs,
  float,
  Fn,
  fract,
  hash,
  mix,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  vec2,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { CREAM, SENSE_RED, SPIDER_BLUE } from '@/gl/palette'

/**
 * The spider-sense overlay, drawn the way the comics draw it: short wavy
 * strokes radiating around the subject — Ditko's squiggles — plus thin red
 * needles flashing in from the frame edges, as in the film's Miles still.
 * One intensity value drives everything; at 0 the overlay is a no-op.
 * Quantizing time into flicker steps re-randomizes phases and dropouts a few
 * times a second, which reads as hand-drawn frames instead of smooth motion.
 */

/** Re-randomizations per second. Comic-book shutter, not smooth motion. */
const FLICKER_HZ = 12

/**
 * The squiggle ring. Angles walk the full circle unevenly, radii and lengths
 * vary, and the colour assignment follows the Miles still: mostly cream with
 * a red and blue accent pair. All units are in aspect-corrected screen space
 * where the frame is 1 unit tall.
 */
type SquiggleStroke = {
  /** Position angle on the ring, radians. */
  angle: number
  /** Ring radius from screen centre. */
  radius: number
  /** Stroke length along its tangent. */
  length: number
  /** Wave cycles along the stroke. */
  frequency: number
  /** Static phase, so identical frequencies still differ. */
  phase: number
  color: 'cream' | 'red' | 'blue'
}

const SQUIGGLES: readonly SquiggleStroke[] = [
  { angle: 0.4, radius: 0.34, length: 0.16, frequency: 55, phase: 0.0, color: 'cream' },
  { angle: 1.1, radius: 0.3, length: 0.13, frequency: 65, phase: 1.7, color: 'red' },
  { angle: 1.9, radius: 0.33, length: 0.18, frequency: 50, phase: 3.1, color: 'cream' },
  { angle: 2.6, radius: 0.28, length: 0.12, frequency: 70, phase: 4.2, color: 'blue' },
  { angle: 3.4, radius: 0.35, length: 0.17, frequency: 55, phase: 0.9, color: 'cream' },
  { angle: 4.1, radius: 0.3, length: 0.14, frequency: 60, phase: 2.3, color: 'cream' },
  { angle: 4.9, radius: 0.32, length: 0.15, frequency: 58, phase: 5.0, color: 'red' },
  { angle: 5.7, radius: 0.29, length: 0.13, frequency: 66, phase: 3.8, color: 'cream' },
]

/** Wave amplitude across the stroke. */
const WAVE_AMPLITUDE = 0.012
/** Stroke half-width at its centre, before the taper thins the tips. */
const STROKE_HALF_WIDTH = 0.006
/** Anti-alias feather on the stroke edge. */
const STROKE_FEATHER = 0.004
/** Per-flicker-step chance a stroke sits out: hash above this keeps it. */
const STROKE_DROPOUT = 0.15

/** Needle columns across the width. */
const NEEDLE_COLUMNS = 36
/** Longest needle reach from the edge, as a fraction of screen height. */
const NEEDLE_REACH = 0.3
/** Fraction of columns silent per flicker step: hash above this fires. */
const NEEDLE_DROPOUT = 0.55
/** Bottom edge needles are dimmer/shorter than the top's. */
const BOTTOM_EDGE_WEIGHT = 0.35
/** Decorrelates the per-column and per-stroke hashes between flicker steps. */
const FLICKER_SALT = 77.7

/** Fades all masks in as intensity leaves zero, so decay tails vanish clean. */
const GATE_LOW = 0.02
const GATE_HIGH = 0.2

export const spiderSense = Fn(([color, intensity]: [Node<'vec3'>, Node<'float'>]) => {
  const flicker = time.mul(FLICKER_HZ).floor()

  // Aspect-corrected, centred: the frame is 1 unit tall, origin mid-screen,
  // so the squiggle ring stays round on any window shape.
  const p = screenUV.sub(0.5).mul(vec2(screenSize.x.div(screenSize.y), 1))

  // --- Radial squiggles -------------------------------------------------
  // Each stroke is built in its own local frame: x along the ring tangent,
  // y along the radius. A sine bends the centreline, a parabolic taper
  // narrows the width to zero at the tips, and a per-step hash jitters the
  // phase so the stroke redraws itself every flicker.
  let cream: Node<'float'> = float(0)
  let red: Node<'float'> = float(0)
  let blue: Node<'float'> = float(0)

  for (const [index, stroke] of SQUIGGLES.entries()) {
    const cosA = Math.cos(stroke.angle)
    const sinA = Math.sin(stroke.angle)
    const rel = p.sub(vec2(cosA * stroke.radius, sinA * stroke.radius))
    const along = rel.x.mul(-sinA).add(rel.y.mul(cosA))
    const across = rel.x.mul(cosA).add(rel.y.mul(sinA))

    const jitter = hash(flicker.add(index * 7.77)).mul(6.28)
    const wave = sin(along.mul(stroke.frequency).add(stroke.phase).add(jitter)).mul(
      WAVE_AMPLITUDE
    )
    const distance = across.sub(wave).abs()

    // 1 at the stroke centre, 0 at the tips; squared so the tips sharpen.
    const tip = along.abs().div(stroke.length / 2)
    const taper = tip.mul(tip).oneMinus().max(0)
    const width = taper.mul(STROKE_HALF_WIDTH)

    const body = smoothstep(width, width.add(STROKE_FEATHER), distance).oneMinus()
    const alive = step(STROKE_DROPOUT, hash(flicker.add(index * 13.13 + 3.7)))
    const mask = body.mul(alive)

    if (stroke.color === 'cream') cream = cream.add(mask)
    else if (stroke.color === 'red') red = red.add(mask)
    else blue = blue.add(mask)
  }

  // --- Edge needles -----------------------------------------------------
  // Thin, sparse, red-only spikes stabbing in from the top and bottom
  // edges: a narrow cubic taper per column, random reach per flicker step,
  // longest near the corners, and the bottom edge kept quieter than the top.
  const fromEdge = abs(screenUV.y.mul(2).sub(1)).oneMinus()
  const column = screenUV.x.mul(NEEDLE_COLUMNS).floor()
  const columnSeed = hash(column.add(flicker.mul(FLICKER_SALT)))
  const active = step(NEEDLE_DROPOUT, hash(column.add(17.3).add(flicker.mul(FLICKER_SALT))))

  const triangle = abs(fract(screenUV.x.mul(NEEDLE_COLUMNS)).mul(2).sub(1)).oneMinus()
  const thin = triangle.mul(triangle).mul(triangle)

  const cornerBoost = abs(screenUV.x.mul(2).sub(1))
    .pow(2)
    .mul(0.55)
    .add(0.45)
  const topWeight = mix(float(BOTTOM_EDGE_WEIGHT), float(1), step(0.5, screenUV.y))

  const reach = columnSeed
    .mul(NEEDLE_REACH)
    .mul(intensity)
    .mul(cornerBoost)
    .mul(topWeight)
  const needle = step(fromEdge, reach.mul(thin)).mul(active)

  // --- Composite --------------------------------------------------------
  const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)
  const withNeedles = mix(color, SENSE_RED, needle.mul(gate))
  const withCream = mix(withNeedles, CREAM, cream.clamp(0, 1).mul(gate))
  const withRed = mix(withCream, SENSE_RED, red.clamp(0, 1).mul(gate))
  return mix(withRed, SPIDER_BLUE, blue.clamp(0, 1).mul(gate))
})
