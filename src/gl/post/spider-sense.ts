import {
  atan,
  clamp,
  float,
  length,
  mix,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  vec2,
} from 'three/tsl'
import type { Node, TextureNode } from 'three/webgpu'

import { MILES_LOOK } from '@/gl/look'
import { dilateDisc } from '@/gl/nodes/morphology'
import { CREAM, SENSE_RED, SPIDER_BLUE } from '@/gl/palette'
import { GESTURE_CAPSULES } from '@/gl/post/spider-sense-geometry'

/**
 * Drawn spider-sense language composited over the already-processed scene:
 * sparse logo-following echoes and short continuously travelling arcs.
 * Geometry never re-randomizes over time; animation changes phase and opacity
 * smoothly like successive drawn frames.
 */

type AccentColor = 'cream' | 'red' | 'blue'

type LogoArc = {
  angle: number
  radius: number
  length: number
  frequency: number
  phase: number
  speed: number
  color: AccentColor
}

type WaveKeepOutDilations<T> = {
  inner: T
  outer: T
}

const LOGO_ARCS: readonly LogoArc[] = [
  { angle: 0.35, radius: 0.34, length: 0.17, frequency: 52, phase: 0.0, speed: 3.1, color: 'cream' },
  { angle: 1.05, radius: 0.31, length: 0.14, frequency: 61, phase: 1.7, speed: -2.5, color: 'red' },
  { angle: 1.85, radius: 0.34, length: 0.18, frequency: 48, phase: 3.1, speed: 2.8, color: 'cream' },
  { angle: 2.55, radius: 0.3, length: 0.14, frequency: 64, phase: 4.2, speed: -3.0, color: 'blue' },
  { angle: 3.3, radius: 0.35, length: 0.18, frequency: 53, phase: 0.9, speed: 2.4, color: 'cream' },
  { angle: 4.05, radius: 0.31, length: 0.15, frequency: 58, phase: 2.3, speed: -2.7, color: 'cream' },
  { angle: 4.85, radius: 0.33, length: 0.16, frequency: 55, phase: 5.0, speed: 3.0, color: 'red' },
  { angle: 5.65, radius: 0.3, length: 0.14, frequency: 62, phase: 3.8, speed: -2.3, color: 'cream' },
]

const ARC_AMPLITUDE = 0.012
const ARC_HALF_WIDTH = 0.006
const ARC_FEATHER = 0.003

const GATE_LOW = 0.02
const GATE_HIGH = 0.2

function addColorMask(
  color: AccentColor,
  mask: Node<'float'>,
  cream: Node<'float'>,
  red: Node<'float'>,
  blue: Node<'float'>
): { cream: Node<'float'>; red: Node<'float'>; blue: Node<'float'> } {
  if (color === 'cream') return { cream: cream.add(mask), red, blue }
  if (color === 'red') return { cream, red: red.add(mask), blue }
  return { cream, red, blue: blue.add(mask) }
}

function logoArcMasks(p: Node<'vec2'>): {
  cream: Node<'float'>
  red: Node<'float'>
  blue: Node<'float'>
} {
  let cream: Node<'float'> = float(0)
  let red: Node<'float'> = float(0)
  let blue: Node<'float'> = float(0)

  for (const arc of LOGO_ARCS) {
    const cosA = Math.cos(arc.angle)
    const sinA = Math.sin(arc.angle)
    const radius = arc.radius * MILES_LOOK.sense.arcRadiusScale
    const relative = p.sub(vec2(cosA * radius, sinA * radius))
    const along = relative.x.mul(cosA).add(relative.y.mul(sinA))
    const across = relative.x.mul(-sinA).add(relative.y.mul(cosA))
    const halfLength = arc.length / 2
    const phase = time.mul(arc.speed).add(arc.phase)
    const wave = sin(along.mul(arc.frequency).add(phase)).mul(ARC_AMPLITUDE)
    const distance = across.sub(wave).abs()
    const tip = along.abs().div(halfLength)
    const taper = float(1).sub(tip.mul(tip)).max(0)
    const width = taper.mul(ARC_HALF_WIDTH)
    const body = smoothstep(
      width,
      width.add(ARC_FEATHER),
      distance
    ).oneMinus()
    const insideLength = step(tip, float(1))
    const mask = body.mul(insideLength)
    ;({ cream, red, blue } = addColorMask(arc.color, mask, cream, red, blue))
  }

  return { cream, red, blue }
}

export function selectWaveKeepOutDilation<T>(
  dilations: WaveKeepOutDilations<T>
): T {
  return dilations.inner
}

function localFragmentMask(centred: Node<'vec2'>): Node<'float'> {
  let mask: Node<'float'> = float(0)

  for (const capsule of GESTURE_CAPSULES) {
    const cosAngle = Math.cos(capsule.angle)
    const sinAngle = Math.sin(capsule.angle)
    const relative = centred.sub(vec2(...capsule.center))
    const along = relative.x.mul(cosAngle).add(relative.y.mul(sinAngle))
    const across = relative.x.mul(-sinAngle).add(relative.y.mul(cosAngle))
    const closestAlong = clamp(
      along,
      -capsule.halfLength,
      capsule.halfLength
    )
    const distance = length(
      vec2(along.sub(closestAlong), across)
    )
    const capsuleMask = smoothstep(
      capsule.halfWidth,
      capsule.halfWidth + capsule.feather,
      distance
    ).oneMinus()
    mask = mask.max(capsuleMask)
  }

  return mask
}

function antialiasMask(
  mask: Node<'float'>,
  featherPx: number
): Node<'float'> {
  const derivative = mask.fwidth().mul(featherPx).max(0.0001)
  return smoothstep(
    float(0.5).sub(derivative),
    float(0.5).add(derivative),
    mask
  )
}

export function spiderSense(
  color: Node<'vec3'>,
  logoMask: TextureNode,
  intensity: Node<'float'>
): Node<'vec3'> {
  const aspect = screenSize.x.div(screenSize.y)
  const centred = screenUV.sub(0.5).mul(vec2(aspect, 1))
  const theta = atan(centred.y, centred.x)
  const sense = MILES_LOOK.sense
  const driftPhase = time.mul(0.35)
  const driftPx = vec2(
    sin(theta.mul(5).add(driftPhase)),
    sin(theta.mul(7).sub(driftPhase))
  ).mul(sense.contourDriftPx / Math.SQRT2)
  const contourUv = screenUV.add(driftPx.div(screenSize))

  const outer = dilateDisc(
    logoMask,
    contourUv,
    sense.contourOuterPx,
    sense.contourTaps
  )
  const inner = dilateDisc(
    logoMask,
    contourUv,
    sense.contourInnerPx,
    sense.contourTaps
  )
  const contourBand = outer.sub(inner).clamp(0, 1)
  const contour = antialiasMask(contourBand, sense.contourFeatherPx).mul(
    localFragmentMask(centred)
  )

  const arcs = logoArcMasks(centred)
  const waveKeepOutDilation = selectWaveKeepOutDilation({ inner, outer })
  const arcKeepOut = waveKeepOutDilation.oneMinus().clamp(0, 1)
  const creamArcs = arcs.cream.mul(arcKeepOut)
  const redArcs = arcs.red.mul(arcKeepOut)
  const blueArcs = arcs.blue.mul(arcKeepOut)
  const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)

  const withContour = mix(color, CREAM, contour.mul(gate))
  const withCream = mix(withContour, CREAM, creamArcs.clamp(0, 1).mul(gate))
  const withRed = mix(withCream, SENSE_RED, redArcs.clamp(0, 1).mul(gate))
  return mix(withRed, SPIDER_BLUE, blueArcs.clamp(0, 1).mul(gate))
}
