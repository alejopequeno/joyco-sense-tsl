import type { BufferGeometry } from 'three/webgpu'

/**
 * Geometry prep for the hero vertex morph. Every shape becomes a non-indexed
 * triangle soup padded to the largest shape's triangle count, so one mesh can
 * blend between any of them vertex-by-vertex in the shader.
 */

export type MorphSet = {
  /** One position array per shape, all the same length (triangles × 9). */
  positions: Float32Array[]
  /** Matching flat-shaded normal arrays. */
  normals: Float32Array[]
  vertexCount: number
}

/**
 * Pads a triangle soup to `targetTriangles` by cycling its own triangles
 * from the start. Duplicates are coplanar with their originals — invisible
 * at rest, but they give a denser morph target enough vertices to fly to.
 */
export function padTriangles(
  source: Float32Array,
  targetTriangles: number
): Float32Array {
  const sourceTriangles = source.length / 9
  const out = new Float32Array(targetTriangles * 9)
  out.set(source)
  for (let triangle = sourceTriangles; triangle < targetTriangles; triangle++) {
    const from = (triangle % sourceTriangles) * 9
    out.set(source.subarray(from, from + 9), triangle * 9)
  }
  return out
}

export function buildMorphSet(geometries: BufferGeometry[]): MorphSet {
  const soups = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry
  )
  const positions = soups.map(
    (geometry) => geometry.getAttribute('position').array as Float32Array
  )
  const normals = soups.map(
    (geometry) => geometry.getAttribute('normal').array as Float32Array
  )
  const targetTriangles = Math.max(...positions.map((p) => p.length / 9))
  return {
    positions: positions.map((p) => padTriangles(p, targetTriangles)),
    normals: normals.map((n) => padTriangles(n, targetTriangles)),
    vertexCount: targetTriangles * 3,
  }
}
