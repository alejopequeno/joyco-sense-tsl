import { screenSize, vec2 } from 'three/tsl'
import type { Node, TextureNode } from 'three/webgpu'

const RING_SCALES = [0.5, 1] as const
const DEFAULT_DISC_TAPS = 16
const MIN_DISC_TAPS = 3
const ZERO_EPSILON = 1e-10

export type DiscOffset = readonly [number, number]

export function balancedReduce<T>(
  values: readonly T[],
  combine: (left: T, right: T) => T
): T {
  if (values.length === 0) {
    throw new Error('Balanced reduction requires at least one value')
  }

  let level = [...values]
  while (level.length > 1) {
    const nextLevel: T[] = []
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]
      const right = level[index + 1]
      if (left === undefined) continue
      nextLevel.push(right === undefined ? left : combine(left, right))
    }
    level = nextLevel
  }

  const result = level[0]
  if (result === undefined) {
    throw new Error('Balanced reduction produced no value')
  }
  return result
}

function cleanTrigonometricZero(value: number): number {
  return Math.abs(value) < ZERO_EPSILON ? 0 : value
}

export function discSampleOffsets(
  radiusPx: number,
  tapCount = DEFAULT_DISC_TAPS
): readonly DiscOffset[] {
  if (!Number.isInteger(tapCount) || tapCount < MIN_DISC_TAPS) {
    throw new Error('Disc dilation requires at least three taps')
  }

  return RING_SCALES.flatMap((ringScale) =>
    Array.from({ length: tapCount }, (_, tap) => {
      const angle = (tap / tapCount) * Math.PI * 2
      const radius = radiusPx * ringScale
      return [
        cleanTrigonometricZero(Math.cos(angle) * radius),
        cleanTrigonometricZero(Math.sin(angle) * radius),
      ] as const
    })
  )
}

/** Approximate a disc dilation with the centre plus two angular sample rings. */
export function dilateDisc(
  source: TextureNode,
  uv: Node<'vec2'>,
  radiusPx: number,
  tapCount = DEFAULT_DISC_TAPS
): Node<'float'> {
  const samples: Node<'float'>[] = [source.sample(uv).r]

  for (const [offsetX, offsetY] of discSampleOffsets(radiusPx, tapCount)) {
    const offset = vec2(offsetX, offsetY).div(screenSize)
    samples.push(source.sample(uv.add(offset)).r)
  }

  return balancedReduce(samples, (left, right) => left.max(right))
}
