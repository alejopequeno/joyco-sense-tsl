export type HexColor = `#${string}`
export type Rgb = readonly [number, number, number]

export const MILES_COLORS = {
  ink: '#040304',
  blackViolet: '#25151D',
  indigo: '#1D127B',
  cobalt: '#06128A',
  violet: '#6C227E',
  bloodRed: '#A91B26',
  hotRed: '#CC2D35',
  coldHighlight: '#D7DEFF',
} as const satisfies Record<string, HexColor>

export const MILES_SURFACE_STOPS = [
  MILES_COLORS.indigo,
  MILES_COLORS.ink,
  MILES_COLORS.blackViolet,
  MILES_COLORS.bloodRed,
  MILES_COLORS.hotRed,
  MILES_COLORS.coldHighlight,
  MILES_COLORS.cobalt,
  MILES_COLORS.violet,
] as const

export const MILES_LOOK = {
  lighting: {
    ambient: 0.32,
    keyGain: 0.72,
    specularPower: 14,
    specularStrength: 0.19,
    rimLow: 0.35,
    rimHigh: 0.9,
    rimStrength: 0.32,
  },
  backdrop: {
    highlightMix: 0.2,
    creamHighlightMix: 0.1,
  },
  aberration: {
    basePixels: 20,
    senseBoostPixels: 100,
  },
  sense: {
    contourInnerPx: 46,
    contourOuterPx: 53,
    contourTaps: 64,
    contourFeatherPx: 1.5,
    contourDriftPx: 1.25,
    arcRadiusScale: 1.4,
  },
  print: {
    scale: 1.5,
    thickness: 1,
    contourWidthPx: 4,
    inkStrength: 0.5,
    crossHatchMax: 0.62,
    singleHatchMax: 0.86,
    halftoneMin: 0.62,
    boost: 1.1,
  },
} as const

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const BYTE_MAX = 255

export function hexToRgb(color: HexColor): Rgb {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error('Expected a #RRGGBB colour')
  }

  const value = Number.parseInt(color.slice(1), 16)
  return [
    ((value >> 16) & BYTE_MAX) / BYTE_MAX,
    ((value >> 8) & BYTE_MAX) / BYTE_MAX,
    (value & BYTE_MAX) / BYTE_MAX,
  ]
}

export function srgbChannelToLinear(channel: number): number {
  if (channel <= 0.04045) return channel / 12.92
  return ((channel + 0.055) / 1.055) ** 2.4
}

export function linearChannelToSrgb(channel: number): number {
  if (channel <= 0.0031308) return channel * 12.92
  return 1.055 * channel ** (1 / 2.4) - 0.055
}

export function hexToLinearRgb(color: HexColor): Rgb {
  const [red, green, blue] = hexToRgb(color)
  return [
    srgbChannelToLinear(red),
    srgbChannelToLinear(green),
    srgbChannelToLinear(blue),
  ]
}

export function chromaticAberrationPixels(intensity: number): number {
  const clampedIntensity = Math.min(Math.max(intensity, 0), 1)
  return (
    MILES_LOOK.aberration.basePixels +
    MILES_LOOK.aberration.senseBoostPixels * clampedIntensity
  )
}
