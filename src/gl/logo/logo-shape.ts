import { Shape } from 'three/webgpu'

const VIEWBOX_WIDTH = 160
const VIEWBOX_HEIGHT = 144

/**
 * The logo's single closed subpath, in raw SVG coordinates. Transcribed from
 * `assets/logo.svg`:
 *
 *   M136 96 L88 144 H0 V40 H64 V112 H80 V24 H0 V0 H160 V24 H136 V96 Z
 *
 * Every segment is a straight line and there are no holes, so `SVGLoader` would
 * buy nothing here — the points are cheaper to read, need no async load, and let
 * us control the pivot exactly. Changing the logo means retranscribing them.
 */
const SVG_POINTS: ReadonlyArray<readonly [number, number]> = [
  [136, 96],
  [88, 144],
  [0, 144],
  [0, 40],
  [64, 40],
  [64, 112],
  [80, 112],
  [80, 24],
  [0, 24],
  [0, 0],
  [160, 0],
  [160, 24],
  [136, 24],
]

/**
 * SVG's Y axis points down and its origin sits at the top-left corner. Baking
 * the flip and the recentre into the point coordinates — rather than applying
 * `scale(1, -1, 1)` to the mesh or the geometry — keeps triangle winding
 * intact, so the extruded normals point outward. Both axes divide by the
 * viewBox height so the aspect ratio survives and the shape is 1 unit tall.
 */
function toLocal([x, y]: readonly [number, number]): [number, number] {
  return [
    (x - VIEWBOX_WIDTH / 2) / VIEWBOX_HEIGHT,
    (VIEWBOX_HEIGHT / 2 - y) / VIEWBOX_HEIGHT,
  ]
}

export function createLogoShape(): Shape {
  const [first, ...rest] = SVG_POINTS.map(toLocal)
  const shape = new Shape()
  shape.moveTo(first[0], first[1])
  for (const [x, y] of rest) shape.lineTo(x, y)
  shape.closePath()
  return shape
}
