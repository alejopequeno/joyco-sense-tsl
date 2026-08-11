import { describe, expect, it } from 'vitest'

import { SPHERE_ORBITS, spherePosition } from '@/gl/spheres/sphere-layout'

describe('SPHERE_ORBITS', () => {
  it('defines six spheres', () => {
    expect(SPHERE_ORBITS).toHaveLength(6)
  })

  it('keeps every orbit clear of the logo, which spans about half a unit', () => {
    for (const orbit of SPHERE_ORBITS) {
      expect(orbit.radius - orbit.scale).toBeGreaterThan(0.7)
    }
  })
})

describe('spherePosition', () => {
  const orbit = SPHERE_ORBITS[0]

  it('is deterministic', () => {
    expect(spherePosition(orbit, 2.5)).toEqual(spherePosition(orbit, 2.5))
  })

  it('moves over time', () => {
    const a = spherePosition(orbit, 0)
    const b = spherePosition(orbit, 1)
    expect(a).not.toEqual(b)
  })

  it('stays within the orbit radius plus bob amplitude', () => {
    for (const o of SPHERE_ORBITS) {
      for (let t = 0; t < 60; t += 0.5) {
        const p = spherePosition(o, t)
        const distance = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
        expect(distance).toBeLessThanOrEqual(o.radius + o.bobAmplitude + 1e-9)
      }
    }
  })

  it('stays between the camera and the backdrop', () => {
    // Camera sits at z=3.2, backdrop at z=-6 (main.ts / backdrop.ts).
    for (const o of SPHERE_ORBITS) {
      for (let t = 0; t < 60; t += 0.5) {
        const p = spherePosition(o, t)
        expect(p.z).toBeLessThan(2.2)
        expect(p.z).toBeGreaterThan(-5)
      }
    }
  })
})
