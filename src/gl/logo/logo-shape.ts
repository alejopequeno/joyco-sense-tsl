import { Shape } from 'three/webgpu'

const VIEWBOX_WIDTH = 352
const VIEWBOX_HEIGHT = 144

/**
 * The Union mark is wide (352:144); normalizing by height alone — as the old
 * square-ish logo did — would span 2.44 world units and collide with the
 * sphere ring. Normalize to this width instead, aspect preserved.
 */
const TARGET_WIDTH = 1.6
const SCALE = VIEWBOX_WIDTH / TARGET_WIDTH

/**
 * The logo's single closed subpath, in raw SVG coordinates. Transcribed from
 * `assets/logo.svg` (Union.svg):
 *
 *   M328 96 L280 144 H0 V40 H176 V112 H192 V24 H0 V0 H352 V24 H328 V96 Z
 *
 * Every segment is a straight line and there are no holes, so `SVGLoader` would
 * buy nothing here — the points are cheaper to read, need no async load, and let
 * us control the pivot exactly. Changing the logo means retranscribing them.
 */
const SVG_POINTS: ReadonlyArray<readonly [number, number]> = [
  [328, 96],
  [280, 144],
  [0, 144],
  [0, 40],
  [176, 40],
  [176, 112],
  [192, 112],
  [192, 24],
  [0, 24],
  [0, 0],
  [352, 0],
  [352, 24],
  [328, 24],
]

/**
 * SVG's Y axis points down and its origin sits at the top-left corner. Baking
 * the flip and the recentre into the point coordinates — rather than applying
 * `scale(1, -1, 1)` to the mesh or the geometry — keeps triangle winding
 * intact, so the extruded normals point outward. Both axes divide by the same
 * scale so the aspect ratio survives and the shape is `TARGET_WIDTH` wide.
 */
function toLocal([x, y]: readonly [number, number]): [number, number] {
  return [(x - VIEWBOX_WIDTH / 2) / SCALE, (VIEWBOX_HEIGHT / 2 - y) / SCALE]
}

export function createLogoShape(): Shape {
  const [first, ...rest] = SVG_POINTS.map(toLocal)
  const shape = new Shape()
  shape.moveTo(first[0], first[1])
  for (const [x, y] of rest) shape.lineTo(x, y)
  shape.closePath()
  return shape
}
