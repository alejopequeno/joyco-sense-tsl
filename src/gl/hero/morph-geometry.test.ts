import { BufferAttribute, BufferGeometry } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { buildMorphSet, padTriangles } from '@/gl/hero/morph-geometry'

/** A soup of `triangles` distinct triangles with matching flat normals. */
function soup(triangles: number): BufferGeometry {
  const position = new Float32Array(triangles * 9)
  const normal = new Float32Array(triangles * 9)
  for (let i = 0; i < position.length; i++) {
    position[i] = i
    normal[i] = i % 3 === 2 ? 1 : 0
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  return geometry
}

describe('padTriangles', () => {
  it('returns the source unchanged when already at the target', () => {
    const source = new Float32Array([...Array(18).keys()])
    expect(Array.from(padTriangles(source, 2))).toEqual(Array.from(source))
  })

  it('pads by cycling triangles from the start', () => {
    const source = new Float32Array([...Array(18).keys()]) // 2 triangles
    const padded = padTriangles(source, 5)
    expect(padded).toHaveLength(45)
    // Prefix is the source verbatim.
    expect(Array.from(padded.slice(0, 18))).toEqual(Array.from(source))
    // Padding cycles: triangle 2 copies triangle 0, 3 copies 1, 4 copies 0.
    expect(Array.from(padded.slice(18, 27))).toEqual(Array.from(source.slice(0, 9)))
    expect(Array.from(padded.slice(27, 36))).toEqual(Array.from(source.slice(9, 18)))
    expect(Array.from(padded.slice(36, 45))).toEqual(Array.from(source.slice(0, 9)))
  })
})

describe('buildMorphSet', () => {
  it('aligns every shape to the largest triangle count', () => {
    const set = buildMorphSet([soup(2), soup(7), soup(4)])
    expect(set.vertexCount).toBe(7 * 3)
    for (const positions of set.positions) expect(positions).toHaveLength(7 * 9)
    for (const normals of set.normals) expect(normals).toHaveLength(7 * 9)
  })

  it('keeps each shape original triangles as the prefix', () => {
    const small = soup(2)
    const set = buildMorphSet([small, soup(3)])
    const original = small.getAttribute('position').array as Float32Array
    expect(Array.from(set.positions[0].slice(0, original.length))).toEqual(
      Array.from(original)
    )
  })

  it('flattens indexed geometries to soups first', () => {
    const indexed = new BufferGeometry()
    // One quad as two indexed triangles over four vertices.
    indexed.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3)
    )
    indexed.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(12).fill(0), 3)
    )
    indexed.setIndex([0, 1, 2, 0, 2, 3])
    const set = buildMorphSet([indexed])
    expect(set.vertexCount).toBe(6)
    expect(set.positions[0]).toHaveLength(18)
  })
})
