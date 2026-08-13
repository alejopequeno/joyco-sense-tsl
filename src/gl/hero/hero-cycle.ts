import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { attribute, transformNormalToView, uniform } from 'three/tsl'
import { BufferAttribute, BufferGeometry, Group, Mesh, Object3D, TorusKnotGeometry } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
import { buildMorphSet } from '@/gl/hero/morph-geometry'
import { SWAP_FLIP_AT, SWAP_SECONDS, swapScale } from '@/gl/hero/swap-scale'
import { createLogoGeometry } from '@/gl/logo/logo-mesh'
import { createSpiderVerseMaterial } from '@/gl/materials/spider-verse-material'

/**
 * The rotating cast of hero shapes — logo, torus knot, Suzanne — blended
 * vertex-by-vertex inside one mesh's shader. A swap reads as a scale-punch:
 * bulge, collapse to zero, flip the shape while invisible, pop back. The
 * group is what DragRotate rotates, so pose survives every swap.
 */

const TORUS_KNOT_RADIUS = 0.34
const TORUS_KNOT_TUBE = 0.13
const TORUS_KNOT_TUBULAR_SEGMENTS = 200
const TORUS_KNOT_RADIAL_SEGMENTS = 32

const SUZANNE_URL = '/suzanne.glb'
// Matches the other cast members' visual weight (logo and torus knot both
// read at roughly this height).
const SUZANNE_HEIGHT = 1.0

/** How many shapes cycle through the mesh — index arithmetic below assumes 3. */
const CAST_SIZE = 3

/**
 * Loads Suzanne, flattens the loaded scene graph into one triangle soup in
 * world space, and normalizes it to match the rest of the cast: centred,
 * non-indexed, scaled to `SUZANNE_HEIGHT`.
 */
async function loadSuzanneGeometry(): Promise<BufferGeometry> {
  const gltf = await new GLTFLoader().loadAsync(SUZANNE_URL)
  const parts: BufferGeometry[] = []

  gltf.scene.traverse((child: Object3D) => {
    // Standard three.js narrowing: cast, then check the `isMesh` flag that
    // only real Mesh instances carry at runtime.
    const candidate = child as Mesh
    if (!candidate.isMesh) return

    candidate.updateWorldMatrix(true, false)
    const geometry = candidate.geometry.clone()
    geometry.applyMatrix4(candidate.matrixWorld)

    // mergeGeometries requires every input to share the exact same
    // attribute set — keep only what the morph target needs.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()

    parts.push(geometry)
  })

  if (parts.length === 0) throw new Error('suzanne.glb contains no mesh to morph into')

  // Typed as always returning a BufferGeometry, but the implementation
  // returns null when attribute sets disagree across inputs — guard for it.
  const merged = mergeGeometries(parts) as BufferGeometry | null
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('failed to merge suzanne.glb meshes into one geometry')

  const nonIndexed = merged.index ? merged.toNonIndexed() : merged
  if (merged.index) merged.dispose()

  // The export is Blender Z-up; without this she loads face-down.
  nonIndexed.rotateX(-Math.PI / 2)

  nonIndexed.computeBoundingBox()
  const box = nonIndexed.boundingBox
  if (!box) throw new Error('suzanne.glb geometry has no bounding box')

  const height = box.max.y - box.min.y
  nonIndexed.center()
  if (height > 0) {
    const scale = SUZANNE_HEIGHT / height
    nonIndexed.scale(scale, scale, scale)
  }

  return nonIndexed
}

export class HeroCycle {
  readonly group = new Group()
  private readonly disposer = new Disposer()
  private readonly mesh: Mesh
  // weights[from] / weights[to] blend between the resting and incoming
  // shape; the third is always 0.
  private readonly weights = [uniform(1), uniform(0), uniform(0)]

  private from = 0
  private to = 0
  private progress = 0
  private morphing = false

  private constructor(geometries: BufferGeometry[]) {
    const morphSet = buildMorphSet(geometries)
    for (const geometry of geometries) geometry.dispose()

    const geometry = new BufferGeometry()
    // Shape 0's positions double as the resting `position` attribute, so
    // raycasting and the initial bounding sphere see the resting shape.
    geometry.setAttribute('position', new BufferAttribute(morphSet.positions[0], 3))
    geometry.setAttribute('morphPos0', new BufferAttribute(morphSet.positions[0], 3))
    geometry.setAttribute('morphPos1', new BufferAttribute(morphSet.positions[1], 3))
    geometry.setAttribute('morphPos2', new BufferAttribute(morphSet.positions[2], 3))
    geometry.setAttribute('morphNor0', new BufferAttribute(morphSet.normals[0], 3))
    geometry.setAttribute('morphNor1', new BufferAttribute(morphSet.normals[1], 3))
    geometry.setAttribute('morphNor2', new BufferAttribute(morphSet.normals[2], 3))
    geometry.computeBoundingSphere()

    const material = createSpiderVerseMaterial()

    // `attribute()`'s generic infers a widened `string` node type from a bare
    // literal argument, which drops the arithmetic methods (`.mul`, `.add`,
    // ...) that TSL's declaration merging only attaches for the literal
    // `'vec3'` type — pin it with `as const` so those methods stay available.
    const vec3Attribute = (name: string) => attribute(name, 'vec3' as const)

    const blended = vec3Attribute('morphPos0')
      .mul(this.weights[0])
      .add(vec3Attribute('morphPos1').mul(this.weights[1]))
      .add(vec3Attribute('morphPos2').mul(this.weights[2]))

    material.positionNode = blended

    const blendedNormal = vec3Attribute('morphNor0')
      .mul(this.weights[0])
      .add(vec3Attribute('morphNor1').mul(this.weights[1]))
      .add(vec3Attribute('morphNor2').mul(this.weights[2]))
      .normalize()
    material.normalNode = transformNormalToView(blendedNormal)

    const mesh = new Mesh(geometry, material)
    // The scale-punch shrinks the mesh to zero and back every swap — three
    // has no way to track that against a static bounding sphere, so it must
    // never get culled mid-swap.
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.mesh = mesh

    this.disposer.add(() => geometry.dispose())
    this.disposer.add(() => material.dispose())
  }

  static async create(): Promise<HeroCycle> {
    const suzanne = await loadSuzanneGeometry()
    const geometries = [
      createLogoGeometry(),
      new TorusKnotGeometry(
        TORUS_KNOT_RADIUS,
        TORUS_KNOT_TUBE,
        TORUS_KNOT_TUBULAR_SEGMENTS,
        TORUS_KNOT_RADIAL_SEGMENTS
      ),
      suzanne,
    ]
    return new HeroCycle(geometries)
  }

  /** Starts a morph to the next hero. Ignored while one is already in flight. */
  advance(): void {
    if (this.morphing) return
    this.to = (this.from + 1) % CAST_SIZE
    this.morphing = true
    this.progress = 0
  }

  /** Advances a running swap: scale down, flip the shape at zero, pop back. */
  update(dt: number): void {
    if (!this.morphing) return
    const previous = this.progress
    this.progress = Math.min(this.progress + dt / SWAP_SECONDS, 1)

    // Flip while invisible: one-hot weights, no blending ever on screen.
    if (previous < SWAP_FLIP_AT && this.progress >= SWAP_FLIP_AT) {
      for (const [index, weight] of this.weights.entries()) {
        weight.value = index === this.to ? 1 : 0
      }
      this.from = this.to
    }

    this.mesh.scale.setScalar(swapScale(this.progress))

    if (this.progress >= 1) {
      this.morphing = false
      this.mesh.scale.setScalar(1)
    }
  }

  dispose(): void {
    this.disposer.dispose()
  }
}
