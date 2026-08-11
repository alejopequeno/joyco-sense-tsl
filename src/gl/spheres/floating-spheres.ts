import { Group, Mesh, SphereGeometry } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
import { createSpiderVerseMaterial } from '@/gl/materials/spider-verse-material'
import { SPHERE_ORBITS, spherePosition } from '@/gl/spheres/sphere-layout'
import type { Ticker } from '@/gl/ticker'

// One segment count for all spheres; scale differences come from the mesh
// scale, so a single geometry is shared.
const SPHERE_SEGMENTS = 48

/**
 * The drifting spheres around the logo, post-cartoon-iii style. One shared
 * geometry and one shared toon material — the world-space noise in the
 * material differentiates their colouring for free.
 */
export class FloatingSpheres {
  readonly group = new Group()
  private readonly disposer = new Disposer()
  private elapsed = 0

  constructor(ticker: Ticker) {
    const geometry = new SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS)
    const material = createSpiderVerseMaterial()
    this.disposer.add(() => geometry.dispose())
    this.disposer.add(() => material.dispose())

    const meshes = SPHERE_ORBITS.map((orbit) => {
      const mesh = new Mesh(geometry, material)
      mesh.scale.setScalar(orbit.scale)
      this.group.add(mesh)
      return mesh
    })

    this.disposer.add(
      ticker.add((dt) => {
        this.elapsed += dt
        for (const [index, orbit] of SPHERE_ORBITS.entries()) {
          const p = spherePosition(orbit, this.elapsed)
          meshes[index].position.set(p.x, p.y, p.z)
        }
      })
    )
  }

  dispose(): void {
    this.disposer.dispose()
  }
}
