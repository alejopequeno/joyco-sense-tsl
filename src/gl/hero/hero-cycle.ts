import { Group, Mesh, SphereGeometry, TorusKnotGeometry } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
import { createLogoGeometry } from '@/gl/logo/logo-mesh'
import { createSpiderVerseMaterial } from '@/gl/materials/spider-verse-material'

// Sized so each hero reads at roughly the logo's visual weight.
const SPHERE_RADIUS = 0.55
const SPHERE_SEGMENTS = 64
const TORUS_KNOT_RADIUS = 0.42
const TORUS_KNOT_TUBE = 0.16
const TORUS_KNOT_TUBULAR_SEGMENTS = 200
const TORUS_KNOT_RADIAL_SEGMENTS = 32

/**
 * The rotating cast of hero meshes — logo, sphere, torus knot (the original
 * sketch's hero) — one visible at a time, all sharing one spider-verse
 * material so the world-space colour spline reads consistently across swaps.
 * The group is what DragRotate rotates, so pose survives the swap.
 */
export class HeroCycle {
  readonly group = new Group()
  private readonly meshes: Mesh[]
  private readonly disposer = new Disposer()
  private index = 0

  constructor() {
    const material = createSpiderVerseMaterial()
    const geometries = [
      createLogoGeometry(),
      new SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      new TorusKnotGeometry(
        TORUS_KNOT_RADIUS,
        TORUS_KNOT_TUBE,
        TORUS_KNOT_TUBULAR_SEGMENTS,
        TORUS_KNOT_RADIAL_SEGMENTS
      ),
    ]
    this.disposer.add(() => material.dispose())
    for (const geometry of geometries) this.disposer.add(() => geometry.dispose())

    this.meshes = geometries.map((geometry, i) => {
      const mesh = new Mesh(geometry, material)
      mesh.visible = i === 0
      this.group.add(mesh)
      return mesh
    })
  }

  /** Shows the next hero. Called mid-burst so the flash covers the cut. */
  advance(): void {
    this.meshes[this.index].visible = false
    this.index = (this.index + 1) % this.meshes.length
    this.meshes[this.index].visible = true
  }

  dispose(): void {
    this.disposer.dispose()
  }
}
