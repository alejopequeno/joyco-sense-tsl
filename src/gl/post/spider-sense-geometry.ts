export type Point2 = readonly [number, number]

export type GestureCapsule = {
  center: Point2
  angle: number
  halfLength: number
  halfWidth: number
  feather: number
}

export const GESTURE_CAPSULES = [
  {
    center: [-0.14, 0.31],
    angle: 0,
    halfLength: 0.16,
    halfWidth: 0.06,
    feather: 0.025,
  },
  {
    center: [0.23, 0.22],
    angle: Math.PI / 2,
    halfLength: 0.1,
    halfWidth: 0.07,
    feather: 0.025,
  },
  {
    center: [0.24, -0.05],
    angle: Math.PI / 2,
    halfLength: 0.12,
    halfWidth: 0.055,
    feather: 0.025,
  },
  {
    center: [0.13, -0.25],
    angle: 0.75,
    halfLength: 0.12,
    halfWidth: 0.06,
    feather: 0.025,
  },
  {
    center: [-0.14, -0.28],
    angle: 0,
    halfLength: 0.15,
    halfWidth: 0.06,
    feather: 0.025,
  },
  {
    center: [-0.24, 0.02],
    angle: Math.PI / 2,
    halfLength: 0.13,
    halfWidth: 0.06,
    feather: 0.025,
  },
] as const satisfies readonly GestureCapsule[]

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const normalized = clampNumber((value - edge0) / (edge1 - edge0), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

export function capsuleDistance(
  point: Point2,
  capsule: GestureCapsule
): number {
  const deltaX = point[0] - capsule.center[0]
  const deltaY = point[1] - capsule.center[1]
  const cosAngle = Math.cos(capsule.angle)
  const sinAngle = Math.sin(capsule.angle)
  const along = deltaX * cosAngle + deltaY * sinAngle
  const across = deltaX * -sinAngle + deltaY * cosAngle
  const closestAlong = clampNumber(
    along,
    -capsule.halfLength,
    capsule.halfLength
  )

  return Math.hypot(along - closestAlong, across)
}

export function capsuleOpacity(
  point: Point2,
  capsule: GestureCapsule
): number {
  const distance = capsuleDistance(point, capsule)
  return 1 - smoothstepNumber(
    capsule.halfWidth,
    capsule.halfWidth + capsule.feather,
    distance
  )
}

export function pointedWaveWidthRatio(
  along: number,
  length: number
): number {
  if (length <= 0) {
    throw new Error('Wave length must be positive')
  }

  const tip = Math.abs(along) / (length / 2)
  return Math.max(1 - tip * tip, 0)
}
