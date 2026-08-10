# Spider-Verse Toon Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restage the scene with post-cartoon-iii's rendering technique (toon banding, blobby background, floating spheres) in the Spider-Verse red/blue palette, plus a drag-triggered spider-sense overlay.

**Architecture:** The existing post chain (Sobel contour, hatching, halftone, paper grain, chromatic aberration in `CartoonEffect`) stays and does the screening work. What changes: the backdrop becomes a smooth blobby duotone field the post chain screens naturally, the logo material becomes self-lit banded toon shading, floating spheres share that material, and a new full-screen spider-sense overlay (edge spikes + squiggles) composites inside `CartoonEffect`, driven by an intensity uniform fed from drag state through a pure attack/decay envelope.

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md`

## Global Constraints

- No `any`; use `unknown` if flexibility needed. Strict mode assumptions throughout.
- Kebab-case file names. All code and comments in English.
- Path alias `@/*` → `./src/*`.
- Commits: conventional prefixes (`feat:`, `fix:`, `docs:`), no `Co-Authored-By` lines.
- Shader-graph code (TSL) is not unit-testable in CI (needs a GPU); unit tests cover pure math only, matching the existing `*.test.ts` pattern. Visual verification happens in `pnpm dev`.
- TSL nodes come from `'three/tsl'`; classes/types from `'three/webgpu'`. Never import from bare `'three'`.
- The scene pass MRT provides `output` and `normal` (`renderer.ts:96`) — the contour pass depends on `normal`, so any material must not break MRT (node materials don't).

## File Structure

Create:
- `src/gl/palette.ts` — the shared Spider-Verse colours (TSL `vec3` constants + ink `Color`).
- `src/gl/post/sense-envelope.ts` — pure attack/decay envelope for spider-sense intensity.
- `src/gl/post/sense-envelope.test.ts`
- `src/gl/post/spider-sense.ts` — full-screen overlay node (spikes + squiggles).
- `src/gl/spheres/sphere-layout.ts` — pure orbit data + position math.
- `src/gl/spheres/sphere-layout.test.ts`
- `src/gl/spheres/floating-spheres.ts` — sphere group, drift animation on the ticker.

Modify:
- `src/gl/logo/drag-rotate.ts` — expose `isDragging`.
- `src/gl/backdrop.ts` — blobby duotone field replaces split + dot lattice.
- `src/gl/materials/spider-verse-material.ts` — banded toon shading replaces standard material.
- `src/gl/post/cartoon-effect.ts` — spider-sense overlay + intensity-boosted aberration + ink colour from palette.
- `src/main.ts` — remove scene lights, add spheres, wire envelope → effect.

---

### Task 1: Sense envelope + drag signal

**Files:**
- Create: `src/gl/post/sense-envelope.ts`
- Test: `src/gl/post/sense-envelope.test.ts`
- Modify: `src/gl/logo/drag-rotate.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `senseStep(value: number, dt: number, active: boolean): number` — frame-rate-independent step of the intensity envelope; `DragRotate.isDragging: boolean` getter. Task 5 wires both together in `main.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/gl/post/sense-envelope.test.ts
import { describe, expect, it } from 'vitest'

import { senseStep } from '@/gl/post/sense-envelope'

describe('senseStep', () => {
  it('rises toward 1 while active', () => {
    const next = senseStep(0, 0.016, true)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('decays toward 0 while inactive without crossing it', () => {
    const next = senseStep(1, 0.016, false)
    expect(next).toBeLessThan(1)
    expect(next).toBeGreaterThan(0)
  })

  it('is frame-rate independent', () => {
    // One 32ms step must land where two 16ms steps do — same argument as
    // decayVelocity in drag-rotate.
    const oneBigStep = senseStep(0.5, 0.032, false)
    const twoSmallSteps = senseStep(senseStep(0.5, 0.016, false), 0.016, false)
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 10)
  })

  it('does not change across a zero-length step', () => {
    expect(senseStep(0.4, 0, true)).toBeCloseTo(0.4, 10)
    expect(senseStep(0.4, 0, false)).toBeCloseTo(0.4, 10)
  })

  it('attacks fast: near full after a quarter second of dragging', () => {
    let value = 0
    for (let i = 0; i < 15; i++) value = senseStep(value, 1 / 60, true)
    expect(value).toBeGreaterThan(0.9)
  })

  it('decays out in about a second and a half', () => {
    let value = 1
    for (let i = 0; i < 90; i++) value = senseStep(value, 1 / 60, false)
    expect(value).toBeLessThan(0.05)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- sense-envelope`
Expected: FAIL — module `@/gl/post/sense-envelope` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/gl/post/sense-envelope.ts

/**
 * Intensity envelope for the spider-sense overlay: snaps up while the logo is
 * being dragged, bleeds away after release. Exponential in both directions so
 * two 8ms steps land exactly where one 16ms step does — same property, and
 * same reasoning, as `decayVelocity` in drag-rotate.
 */

/** Seconds to close ~63% of the gap to 1 while dragging. Fast — danger snaps. */
const ATTACK_TAU = 0.06
/** Seconds to shed ~63% after release. exp(-1.5/0.35) ≈ 0.014, so the overlay
 * is visually gone about a second and a half after the pointer lets go. */
const DECAY_TAU = 0.35

export function senseStep(value: number, dt: number, active: boolean): number {
  const target = active ? 1 : 0
  const tau = active ? ATTACK_TAU : DECAY_TAU
  return target + (value - target) * Math.exp(-dt / tau)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- sense-envelope`
Expected: PASS, 6 tests.

- [ ] **Step 5: Expose drag state on DragRotate**

In `src/gl/logo/drag-rotate.ts`, add a getter to the `DragRotate` class (after the private fields, before the constructor). `dragging` already tracks exactly this (`drag-rotate.ts:43`); no DOM-dependent test is possible in the node test environment, and the getter adds no logic to test.

```ts
  /** True while a pointer is actively dragging. Feeds the spider-sense envelope. */
  get isDragging(): boolean {
    return this.dragging
  }
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `pnpm build && pnpm test`
Expected: build clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/gl/post/sense-envelope.ts src/gl/post/sense-envelope.test.ts src/gl/logo/drag-rotate.ts
git commit -m "feat: add spider-sense intensity envelope and expose drag state"
```

---

### Task 2: Palette module + blobby backdrop

**Files:**
- Create: `src/gl/palette.ts`
- Modify: `src/gl/backdrop.ts` (full rewrite of the colour graph, same exported signature)

**Interfaces:**
- Consumes: nothing.
- Produces: `SPIDER_BLUE`, `SPIDER_RED`, `SPIDER_MAGENTA`, `SENSE_RED`, `CREAM` (TSL `Node<'vec3'>` constants) and `INK_COLOR` (`Color`) from `@/gl/palette`. `createBackdrop(): Mesh` keeps its signature. Tasks 3, 4, 5 import the palette.

- [ ] **Step 1: Write the palette module**

```ts
// src/gl/palette.ts
import { vec3 } from 'three/tsl'
import { Color } from 'three/webgpu'
import type { Node } from 'three/webgpu'

/**
 * The Spider-Verse palette, sampled from the Miles Morales spider-sense still:
 * a deep ultramarine and a hot red carrying the duotone, magenta on the seams,
 * cream where the printing lets the page through. Shared by the backdrop, the
 * toon material and the post chain so the scene stays one print job.
 */

export const SPIDER_BLUE: Node<'vec3'> = vec3(0.07, 0.1, 0.55)
export const SPIDER_RED: Node<'vec3'> = vec3(0.82, 0.1, 0.12)
export const SPIDER_MAGENTA: Node<'vec3'> = vec3(0.72, 0.12, 0.55)
/** Hotter than SPIDER_RED — the spider-sense overlay has to read over it. */
export const SENSE_RED: Node<'vec3'> = vec3(1.0, 0.16, 0.13)
export const CREAM: Node<'vec3'> = vec3(0.96, 0.93, 0.86)

/** Ink for the screening layers: near-black violet, not the sketch's warm
 * brown — brown mud-ifies a blue/red duotone. */
export const INK_COLOR = new Color(0.1, 0.06, 0.16)
```

- [ ] **Step 2: Rewrite the backdrop colour graph**

Replace the whole body of `src/gl/backdrop.ts`. The split + Ben-Day lattice goes away: the post chain already lays dots over bright tones and hatching over dark ones (`cartoon-effect.ts`), so the backdrop only has to supply a smooth field with tonal variety — exactly how post-cartoon-iii's background gets its dots. Blobs live in screen space like the old lattice did: they belong to the page, not the world.

```ts
// src/gl/backdrop.ts
import { mix, mx_noise_float, screenSize, screenUV, smoothstep, vec2, vec3 } from 'three/tsl'
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu'

import { CREAM, SPIDER_BLUE, SPIDER_RED } from '@/gl/palette'

/**
 * The field the logo sits against: soft blobby patches of the film's duotone,
 * post-cartoon-iii style. Unlit and normal-flat on purpose, so the contour
 * pass leaves it alone; the screening layers in the post chain are what turn
 * its bright patches into Ben-Day dots and its dark ones into hatching.
 */

// Noise frequencies over aspect-corrected screen space. Low: a handful of
// blobs across the frame, not a texture.
const DUOTONE_SCALE = 1.4
const PATCH_SCALE = 1.1
// Decorrelates the cream patches from the duotone blobs.
const PATCH_OFFSET = 31.7

// How hard the blue and red fields cut against each other. Tight enough to
// stay graphic, soft enough not to alias.
const DUOTONE_EDGE_LOW = 0.38
const DUOTONE_EDGE_HIGH = 0.62

// Cream patches: where the noise crests, the page shows through. The post
// chain's halftone threshold sits at 0.62 luma, so a 0.85 lift is comfortably
// inside dot territory.
const PATCH_EDGE_LOW = 0.55
const PATCH_EDGE_HIGH = 0.85
const PATCH_LIFT = 0.85

// Far enough back to clear the logo's rotation, large enough to cover the
// frustum at that distance on any reasonable aspect ratio.
const BACKDROP_DISTANCE = 6
const BACKDROP_SIZE = 40

export function createBackdrop(): Mesh {
  const material = new MeshBasicNodeMaterial()

  // Aspect-corrected so blobs stay round on wide screens.
  const p = screenUV.mul(vec2(screenSize.x.div(screenSize.y), 1))

  const duotoneNoise = mx_noise_float(vec3(p.mul(DUOTONE_SCALE), 0)).mul(0.5).add(0.5)
  const duotone = mix(
    SPIDER_BLUE,
    SPIDER_RED,
    smoothstep(DUOTONE_EDGE_LOW, DUOTONE_EDGE_HIGH, duotoneNoise)
  )

  const patchNoise = mx_noise_float(vec3(p.mul(PATCH_SCALE).add(PATCH_OFFSET), 0))
    .mul(0.5)
    .add(0.5)
  const lift = smoothstep(PATCH_EDGE_LOW, PATCH_EDGE_HIGH, patchNoise)

  material.colorNode = mix(duotone, CREAM, lift.mul(PATCH_LIFT))

  const backdrop = new Mesh(new PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE), material)
  backdrop.position.z = -BACKDROP_DISTANCE
  return backdrop
}
```

- [ ] **Step 3: Point the post chain's ink at the palette**

In `src/gl/post/cartoon-effect.ts`: delete the local `INK_COLOR` constant and its comment block (`cartoon-effect.ts:41-44`), and import instead:

```ts
import { INK_COLOR } from '@/gl/palette'
```

- [ ] **Step 4: Typecheck and eyeball**

Run: `pnpm build` — expected clean.
Run: `pnpm dev`, open the page. Expected: background is soft blue/red blobs with cream patches; the cream patches carry halftone dots and the dark blues carry hatching (both from the post chain); no more hard vertical split, no more uniform dot lattice; logo outline still inked.

- [ ] **Step 5: Commit**

```bash
git add src/gl/palette.ts src/gl/backdrop.ts src/gl/post/cartoon-effect.ts
git commit -m "feat: restage the backdrop as blobby duotone driven by the shared palette"
```

---

### Task 3: Banded toon material

**Files:**
- Modify: `src/gl/materials/spider-verse-material.ts` (rewrite)
- Modify: `src/main.ts` (remove scene lights)

**Interfaces:**
- Consumes: `colorSpline` from `@/gl/nodes/color-spline` (existing), palette from Task 2.
- Produces: `createSpiderVerseMaterial(): MeshBasicNodeMaterial` — note the return type changes from `MeshStandardNodeMaterial`. `createLogoMesh` (`logo-mesh.ts:32`) keeps working unchanged since `Mesh` accepts any material. Task 4's spheres call this same factory.

- [ ] **Step 1: Rewrite the material as self-lit banded toon**

The scene's three lights stop mattering: light directions become constants inside the shader, which is what makes the bands stable and art-directable. The noise-driven `colorSpline` ramp survives as the albedo.

```ts
// src/gl/materials/spider-verse-material.ts
import {
  cameraPosition,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  step,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

import { colorSpline } from '@/gl/nodes/color-spline'
import { CREAM, SPIDER_BLUE, SPIDER_MAGENTA } from '@/gl/palette'

/**
 * Banded toon shading in the post-cartoon-iii mould: cel-stepped key light,
 * a flat clipped specular, a cool rim from the opposite side — computed
 * against fixed light directions rather than scene lights, so the bands are
 * stable and the scene needs no light objects at all. The albedo keeps the
 * sketch's noise-driven colour spline, so blotches of the ramp still belong
 * to the object in world space.
 */

// Same reasoning as before: world-space noise so rotation carries the
// colouring with the mesh.
const NOISE_SCALE = 2.5
const CONTRAST_EDGE = 0.5

// The film's cross lighting: warm key from screen right and above, cool rim
// from screen left and below. Normalized by hand.
const KEY_DIR = vec3(0.55, 0.45, 0.7).normalize()
const RIM_DIR = vec3(-0.7, -0.2, 0.25).normalize()

/** Cel bands on the key light. Three fills: shadow, half-tone, lit. */
const BANDS = 3
/** Shadow floor so unlit faces keep colour for the post chain to hatch. */
const AMBIENT = 0.35
const KEY_GAIN = 0.9

/** Cosine cut for the specular hotspot — hard clip, flat white, cartoon. */
const SPECULAR_CUT = 0.97
const SPECULAR_STRENGTH = 0.9

/** Cool bounce strength on the rim-lit side. */
const RIM_LIGHT_STRENGTH = 0.5

/** Fresnel cut for the magenta edge glow. */
const FRESNEL_CUT = 0.75
const FRESNEL_STRENGTH = 0.6

export function createSpiderVerseMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()

  const noiseScale = uniform(NOISE_SCALE)
  const noise = mx_noise_float(positionWorld.mul(noiseScale)).mul(0.5).add(0.5)
  const ramp = smoothstep(0.5 - CONTRAST_EDGE, 0.5 + CONTRAST_EDGE, noise)
  const albedo = colorSpline(ramp)

  const n = normalWorld
  const viewDir = cameraPosition.sub(positionWorld).normalize()

  // Cel-stepped diffuse: quantize N·L into flat fills.
  const key = n.dot(KEY_DIR).max(0)
  const band = key.mul(BANDS).floor().div(BANDS)
  const lit = albedo.mul(band.mul(KEY_GAIN).add(AMBIENT))

  // Cool bounce where the rim light lands.
  const rim = n.dot(RIM_DIR).max(0).pow(2)
  const withRim = lit.add(SPIDER_BLUE.mul(rim.mul(RIM_LIGHT_STRENGTH)))

  // Flat clipped specular off the key.
  const halfway = KEY_DIR.add(viewDir).normalize()
  const specular = step(SPECULAR_CUT, n.dot(halfway).max(0))
  const withSpecular = withRim.mix(CREAM, specular.mul(SPECULAR_STRENGTH))

  // Magenta fresnel edge — the seam colour of the palette.
  const fresnel = n.dot(viewDir).max(0).oneMinus()
  const edge = step(FRESNEL_CUT, fresnel)
  material.colorNode = withSpecular.mix(SPIDER_MAGENTA, edge.mul(FRESNEL_STRENGTH))

  return material
}
```

- [ ] **Step 2: Remove the scene lights from main**

In `src/main.ts`: delete the `redKey`, `blueRim`, `fillLight` declarations, their comment block and the `scene.add(redKey, blueRim, fillLight)` line (`main.ts:21-31`). Remove `AmbientLight` and `DirectionalLight` from the `three/webgpu` import.

- [ ] **Step 3: Typecheck and eyeball**

Run: `pnpm build` — expected clean.
Run: `pnpm dev`. Expected: logo reads as flat cel fills (three visible bands as it rotates), a hard flat white hotspot, magenta edge glow, blue bounce on the lower-left faces; contour outline still present (MRT normals are material-independent); post chain still screens the bands into hatching/dots by luma.

- [ ] **Step 4: Commit**

```bash
git add src/gl/materials/spider-verse-material.ts src/main.ts
git commit -m "feat: replace standard lighting with self-lit banded toon shading"
```

---

### Task 4: Floating spheres

**Files:**
- Create: `src/gl/spheres/sphere-layout.ts`
- Test: `src/gl/spheres/sphere-layout.test.ts`
- Create: `src/gl/spheres/floating-spheres.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `createSpiderVerseMaterial()` from Task 3, `Ticker` (existing), `Disposer` (existing).
- Produces: `SPHERE_ORBITS: readonly SphereOrbit[]`, `spherePosition(orbit: SphereOrbit, elapsed: number): { x: number; y: number; z: number }` (pure), and `class FloatingSpheres { readonly group: Group; constructor(ticker: Ticker); dispose(): void }`.

- [ ] **Step 1: Write the failing layout tests**

```ts
// src/gl/spheres/sphere-layout.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- sphere-layout`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the layout module**

```ts
// src/gl/spheres/sphere-layout.ts

/**
 * Orbit definitions and position math for the floating spheres, kept pure so
 * the drift can be tested without three. Values are hand-placed, not random:
 * post-cartoon-iii scatters its spheres deliberately — near/far, big/small —
 * and a seeded layout would just be these numbers with extra steps.
 */

export type SphereOrbit = {
  /** Distance from the logo centre, world units. */
  radius: number
  /** Orbit plane tilt off the screen plane, radians. */
  tilt: number
  /** Start angle, radians. */
  phase: number
  /** Radians per second. Slow — these drift, they do not orbit visibly. */
  speed: number
  /** Sphere radius, world units. */
  scale: number
  /** Vertical bob distance, world units. */
  bobAmplitude: number
  /** Bob cycles per second, in radians. */
  bobFrequency: number
}

export const SPHERE_ORBITS: readonly SphereOrbit[] = [
  { radius: 1.6, tilt: 0.5, phase: 0.4, speed: 0.11, scale: 0.34, bobAmplitude: 0.05, bobFrequency: 0.7 },
  { radius: 1.9, tilt: -0.3, phase: 1.7, speed: 0.08, scale: 0.2, bobAmplitude: 0.07, bobFrequency: 0.5 },
  { radius: 1.4, tilt: 0.9, phase: 2.9, speed: 0.13, scale: 0.14, bobAmplitude: 0.04, bobFrequency: 0.9 },
  { radius: 2.2, tilt: 0.2, phase: 4.0, speed: 0.06, scale: 0.42, bobAmplitude: 0.06, bobFrequency: 0.4 },
  { radius: 1.7, tilt: -0.7, phase: 5.1, speed: 0.1, scale: 0.16, bobAmplitude: 0.05, bobFrequency: 0.8 },
  { radius: 2.0, tilt: 0.6, phase: 5.9, speed: 0.09, scale: 0.26, bobAmplitude: 0.08, bobFrequency: 0.6 },
]

/**
 * Position on a tilted circular orbit plus a vertical bob. The z-axis
 * component is halved so the ring hugs the screen plane: spheres pass beside
 * the logo, not through the camera or the backdrop.
 */
export function spherePosition(
  orbit: SphereOrbit,
  elapsed: number
): { x: number; y: number; z: number } {
  const angle = orbit.phase + orbit.speed * elapsed
  const bob = Math.sin(elapsed * orbit.bobFrequency) * orbit.bobAmplitude
  return {
    x: Math.cos(angle) * orbit.radius,
    y: Math.sin(angle) * orbit.radius * Math.sin(orbit.tilt) + bob,
    z: Math.sin(angle) * orbit.radius * Math.cos(orbit.tilt) * 0.5,
  }
}
```

Note for the bounds test: `|y| ≤ radius·|sin(tilt)| + bob` and the components never exceed the sphere of radius `radius + bobAmplitude`; the z test passes because `max |z| = 2.2 · cos(0.2) · 0.5 ≈ 1.08`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- sphere-layout`
Expected: PASS.

- [ ] **Step 5: Write the sphere group**

```ts
// src/gl/spheres/floating-spheres.ts
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
```

- [ ] **Step 6: Add the spheres to the scene**

In `src/main.ts`, after the logo is added:

```ts
const spheres = new FloatingSpheres(ticker)
scene.add(spheres.group)
```

with the import `import { FloatingSpheres } from '@/gl/spheres/floating-spheres'` (keep the import list alphabetical by path, matching the file's existing order).

- [ ] **Step 7: Typecheck, full suite, eyeball**

Run: `pnpm build && pnpm test` — expected clean.
Run: `pnpm dev`. Expected: six toon-shaded spheres of varied sizes drifting slowly around the logo, each picking up contour outlines and screening; none clips the camera or hides the logo for long.

- [ ] **Step 8: Commit**

```bash
git add src/gl/spheres/ src/main.ts
git commit -m "feat: add drifting toon spheres around the logo"
```

---

### Task 5: Spider-sense overlay

**Files:**
- Create: `src/gl/post/spider-sense.ts`
- Modify: `src/gl/post/cartoon-effect.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `senseStep` and `DragRotate.isDragging` from Task 1, `SENSE_RED`/`SPIDER_BLUE` from Task 2's palette.
- Produces: `spiderSense(color: Node<'vec3'>, intensity: Node<'float'>): Node<'vec3'>` (TSL `Fn`); `CartoonEffect.setSenseIntensity(value: number): void`.

- [ ] **Step 1: Write the overlay node**

```ts
// src/gl/post/spider-sense.ts
import {
  abs,
  float,
  Fn,
  fract,
  hash,
  mix,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { SENSE_RED, SPIDER_BLUE } from '@/gl/palette'

/**
 * The film's spider-sense language as a full-screen overlay: jagged red
 * spikes stabbing in from the top and bottom edges, and wavy squiggle lines
 * hanging in the frame. Everything is driven by one intensity value — at 0
 * the overlay is a no-op — and re-randomized a few times a second by
 * quantizing time into flicker steps, which is what makes it vibrate like
 * hand-drawn frames instead of animating smoothly.
 */

/** Columns of spikes across the width. */
const SPIKE_COLUMNS = 48
/** Longest spike reach from the edge, as a fraction of screen height. */
const SPIKE_REACH = 0.32
/** Re-randomizations per second. Comic-book shutter, not smooth motion. */
const FLICKER_HZ = 12
/** Decorrelates the per-column hash between flicker steps. */
const FLICKER_SALT = 77.7

/** Squiggle line count and shape. */
const SQUIGGLE_ROWS = [0.18, 0.42, 0.63, 0.86] as const
const SQUIGGLE_FREQUENCY = 40
const SQUIGGLE_AMPLITUDE = 0.012
const SQUIGGLE_HALF_WIDTH = 0.004
const SQUIGGLE_FEATHER = 0.003
/** Fraction of the width a squiggle segment covers. */
const SQUIGGLE_SPAN = 0.3

/** Fades all masks in as intensity leaves zero, so decay tails vanish clean. */
const GATE_LOW = 0.02
const GATE_HIGH = 0.2

export const spiderSense = Fn(
  ([color, intensity]: [Node<'vec3'>, Node<'float'>]) => {
    const flicker = time.mul(FLICKER_HZ).floor()

    // --- Edge spikes ---------------------------------------------------
    // 0 at the top and bottom edges, 1 at the vertical centre.
    const fromEdge = abs(screenUV.y.mul(2).sub(1)).oneMinus()
    const column = screenUV.x.mul(SPIKE_COLUMNS).floor()
    // Per-column, per-flicker-step random reach.
    const columnSeed = hash(column.add(flicker.mul(FLICKER_SALT)))
    // Triangle profile inside the column: full reach at the centre, zero at
    // the sides — that is what makes each column a spike, not a bar.
    const triangle = abs(fract(screenUV.x.mul(SPIKE_COLUMNS)).mul(2).sub(1)).oneMinus()
    const reach = columnSeed.mul(SPIKE_REACH).mul(intensity).mul(triangle)
    const spike = step(fromEdge, reach)

    // --- Squiggles ------------------------------------------------------
    // Four wavy strokes, alternating red and blue, each jumping to a new
    // horizontal window every flicker step.
    let squiggleRed: Node<'float'> = float(0)
    let squiggleBlue: Node<'float'> = float(0)
    for (const [index, row] of SQUIGGLE_ROWS.entries()) {
      const seed = hash(flicker.add(index * 13.31))
      const start = seed.mul(1 - SQUIGGLE_SPAN)
      const window = step(start, screenUV.x).mul(step(screenUV.x, start.add(SQUIGGLE_SPAN)))
      const wave = sin(screenUV.x.mul(SQUIGGLE_FREQUENCY).add(seed.mul(50))).mul(
        SQUIGGLE_AMPLITUDE
      )
      const line = smoothstep(
        SQUIGGLE_HALF_WIDTH + SQUIGGLE_FEATHER,
        SQUIGGLE_HALF_WIDTH,
        abs(screenUV.y.sub(row).sub(wave))
      ).mul(window)
      if (index % 2 === 0) squiggleRed = squiggleRed.add(line)
      else squiggleBlue = squiggleBlue.add(line)
    }

    // --- Composite ------------------------------------------------------
    const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)
    const withSpikes = mix(color, SENSE_RED, spike.mul(gate))
    const withRed = mix(withSpikes, SENSE_RED, squiggleRed.clamp(0, 1).mul(gate))
    return mix(withRed, SPIDER_BLUE, squiggleBlue.clamp(0, 1).mul(gate))
  }
)
```

- [ ] **Step 2: Integrate into CartoonEffect**

In `src/gl/post/cartoon-effect.ts`:

1. Add imports:

```ts
import { spiderSense } from '@/gl/post/spider-sense'
```

2. Add fields to the class, next to the existing uniforms:

```ts
  /** Spider-sense overlay strength, 0..1. Fed per frame from the envelope. */
  private readonly senseIntensity = uniform(0)
  /** Extra RGB split at full spider-sense, in pixels, on top of `aberration`. */
  private readonly senseAberrationBoost = uniform(150)
```

3. Add the setter method:

```ts
  /** Drives the overlay and the aberration boost. Clamped to 0..1. */
  setSenseIntensity(value: number): void {
    this.senseIntensity.value = Math.min(Math.max(value, 0), 1)
  }
```

4. In `build`, scale the aberration with intensity — replace the return with:

```ts
    const composite = rtt(this.buildComposite(scenePass))
    const delta = this.aberration.add(this.senseIntensity.mul(this.senseAberrationBoost))
    return chromaticAberration(composite, delta)
```

5. In `buildComposite`, wrap the final colour — replace `return vec4(screened.mul(grain), 1)` with:

```ts
    return vec4(spiderSense(screened.mul(grain), this.senseIntensity), 1)
```

The overlay sits inside the `rtt` composite on purpose: the spikes then pass through the chromatic aberration and fringe at the frame edges exactly like the reference still.

- [ ] **Step 3: Wire the envelope in main**

In `src/main.ts`:

```ts
import { senseStep } from '@/gl/post/sense-envelope'
```

Capture the controller and the effect (currently `new DragRotate(...)` is unassigned and the effect is constructed inline):

```ts
const dragRotate = new DragRotate(logo, canvas, ticker)

const cartoon = new CartoonEffect()

let senseIntensity = 0
ticker.add((dt) => {
  senseIntensity = senseStep(senseIntensity, dt, dragRotate.isDragging)
  cartoon.setSenseIntensity(senseIntensity)
})
```

and pass `post: cartoon` in the `Renderer` options.

- [ ] **Step 4: Typecheck, full suite, eyeball**

Run: `pnpm build && pnpm test` — expected clean.
Run: `pnpm dev`. Expected: scene idle shows no overlay. On dragging the logo: jagged red spikes flicker in from the top and bottom edges within a quarter second, red/blue squiggles jump around the frame at ~12Hz, corner colour fringing visibly widens. On release: everything bleeds out in about a second and a half.

- [ ] **Step 5: Commit**

```bash
git add src/gl/post/spider-sense.ts src/gl/post/cartoon-effect.ts src/main.ts
git commit -m "feat: add drag-triggered spider-sense overlay with boosted aberration"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] `pnpm dev` — check against both references:
  - post-cartoon-iii: toon bands + clipped specular on logo and spheres, dark contour outlines, blobby background, dots in bright patches, hatching in shadow, paper grain, corner aberration.
  - Miles still: blue/red duotone palette throughout, spikes + squiggles on drag.
- [ ] Tuning pass: adjust palette values, band count, spike reach, flicker rate by eye. Commit tweaks as `fix:` or `feat:` as appropriate.
