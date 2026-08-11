# Spider-Sense Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bunting-like overlay with comic-accurate spider-sense (radial squiggles + thin red needles) and add tap-to-pose: a tap tweens the logo to a fixed pose with the sense burning.

**Architecture:** `spider-sense.ts` is rewritten in place — same exported signature, new masks — so `CartoonEffect` needs no changes. Tap detection and the pose tween live in `DragRotate`, which gains an `isPosing` state the envelope wiring in `main.ts` ORs with `isDragging`.

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 2")

## Global Constraints

- No `any`; strict mode; `noUnusedLocals`.
- Kebab-case file names. All code and comments in English.
- Path alias `@/*` → `./src/*`.
- Commits: conventional prefixes, no `Co-Authored-By` lines.
- TSL nodes from `'three/tsl'`; classes/types from `'three/webgpu'`. Never import from bare `'three'`.
- TSL pitfalls already established on this branch: never use the `.mix()` chain method (receiver becomes the blend factor) — call `mix(base, target, factor)` positionally; `smoothstep` edges must be ascending (use `.oneMinus()` to invert).
- Shader-graph code is not unit-testable; unit tests cover pure math only. Visual verification is the controller's.

---

### Task 1: Rewrite the spider-sense overlay

**Files:**
- Modify: `src/gl/post/spider-sense.ts` (full rewrite, same export)

**Interfaces:**
- Consumes: `SENSE_RED`, `SPIDER_BLUE`, `CREAM` from `@/gl/palette` (all `Node<'vec3'>`).
- Produces: `spiderSense(color: Node<'vec3'>, intensity: Node<'float'>): Node<'vec3'>` — unchanged signature, so `cartoon-effect.ts` keeps working untouched.

- [ ] **Step 1: Replace the file body**

```ts
// src/gl/post/spider-sense.ts
import {
  abs,
  float,
  Fn,
  fract,
  hash,
  mix,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  vec2,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { CREAM, SENSE_RED, SPIDER_BLUE } from '@/gl/palette'

/**
 * The spider-sense overlay, drawn the way the comics draw it: short wavy
 * strokes radiating around the subject — Ditko's squiggles — plus thin red
 * needles flashing in from the frame edges, as in the film's Miles still.
 * One intensity value drives everything; at 0 the overlay is a no-op.
 * Quantizing time into flicker steps re-randomizes phases and dropouts a few
 * times a second, which reads as hand-drawn frames instead of smooth motion.
 */

/** Re-randomizations per second. Comic-book shutter, not smooth motion. */
const FLICKER_HZ = 12

/**
 * The squiggle ring. Angles walk the full circle unevenly, radii and lengths
 * vary, and the colour assignment follows the Miles still: mostly cream with
 * a red and blue accent pair. All units are in aspect-corrected screen space
 * where the frame is 1 unit tall.
 */
type SquiggleStroke = {
  /** Position angle on the ring, radians. */
  angle: number
  /** Ring radius from screen centre. */
  radius: number
  /** Stroke length along its tangent. */
  length: number
  /** Wave cycles along the stroke. */
  frequency: number
  /** Static phase, so identical frequencies still differ. */
  phase: number
  color: 'cream' | 'red' | 'blue'
}

const SQUIGGLES: readonly SquiggleStroke[] = [
  { angle: 0.4, radius: 0.34, length: 0.16, frequency: 55, phase: 0.0, color: 'cream' },
  { angle: 1.1, radius: 0.3, length: 0.13, frequency: 65, phase: 1.7, color: 'red' },
  { angle: 1.9, radius: 0.33, length: 0.18, frequency: 50, phase: 3.1, color: 'cream' },
  { angle: 2.6, radius: 0.28, length: 0.12, frequency: 70, phase: 4.2, color: 'blue' },
  { angle: 3.4, radius: 0.35, length: 0.17, frequency: 55, phase: 0.9, color: 'cream' },
  { angle: 4.1, radius: 0.3, length: 0.14, frequency: 60, phase: 2.3, color: 'cream' },
  { angle: 4.9, radius: 0.32, length: 0.15, frequency: 58, phase: 5.0, color: 'red' },
  { angle: 5.7, radius: 0.29, length: 0.13, frequency: 66, phase: 3.8, color: 'cream' },
]

/** Wave amplitude across the stroke. */
const WAVE_AMPLITUDE = 0.012
/** Stroke half-width at its centre, before the taper thins the tips. */
const STROKE_HALF_WIDTH = 0.006
/** Anti-alias feather on the stroke edge. */
const STROKE_FEATHER = 0.004
/** Per-flicker-step chance a stroke sits out: hash above this keeps it. */
const STROKE_DROPOUT = 0.15

/** Needle columns across the width. */
const NEEDLE_COLUMNS = 36
/** Longest needle reach from the edge, as a fraction of screen height. */
const NEEDLE_REACH = 0.3
/** Fraction of columns silent per flicker step: hash above this fires. */
const NEEDLE_DROPOUT = 0.55
/** Bottom edge needles are dimmer/shorter than the top's. */
const BOTTOM_EDGE_WEIGHT = 0.35
/** Decorrelates the per-column and per-stroke hashes between flicker steps. */
const FLICKER_SALT = 77.7

/** Fades all masks in as intensity leaves zero, so decay tails vanish clean. */
const GATE_LOW = 0.02
const GATE_HIGH = 0.2

export const spiderSense = Fn(([color, intensity]: [Node<'vec3'>, Node<'float'>]) => {
  const flicker = time.mul(FLICKER_HZ).floor()

  // Aspect-corrected, centred: the frame is 1 unit tall, origin mid-screen,
  // so the squiggle ring stays round on any window shape.
  const p = screenUV.sub(0.5).mul(vec2(screenSize.x.div(screenSize.y), 1))

  // --- Radial squiggles -------------------------------------------------
  // Each stroke is built in its own local frame: x along the ring tangent,
  // y along the radius. A sine bends the centreline, a parabolic taper
  // narrows the width to zero at the tips, and a per-step hash jitters the
  // phase so the stroke redraws itself every flicker.
  let cream: Node<'float'> = float(0)
  let red: Node<'float'> = float(0)
  let blue: Node<'float'> = float(0)

  for (const [index, stroke] of SQUIGGLES.entries()) {
    const cosA = Math.cos(stroke.angle)
    const sinA = Math.sin(stroke.angle)
    const rel = p.sub(vec2(cosA * stroke.radius, sinA * stroke.radius))
    const along = rel.x.mul(-sinA).add(rel.y.mul(cosA))
    const across = rel.x.mul(cosA).add(rel.y.mul(sinA))

    const jitter = hash(flicker.add(index * 7.77)).mul(6.28)
    const wave = sin(along.mul(stroke.frequency).add(stroke.phase).add(jitter)).mul(
      WAVE_AMPLITUDE
    )
    const distance = across.sub(wave).abs()

    // 1 at the stroke centre, 0 at the tips; squared so the tips sharpen.
    const tip = along.abs().div(stroke.length / 2)
    const taper = tip.mul(tip).oneMinus().max(0)
    const width = taper.mul(STROKE_HALF_WIDTH)

    const body = smoothstep(width, width.add(STROKE_FEATHER), distance).oneMinus()
    const alive = step(STROKE_DROPOUT, hash(flicker.add(index * 13.13 + 3.7)))
    const mask = body.mul(alive)

    if (stroke.color === 'cream') cream = cream.add(mask)
    else if (stroke.color === 'red') red = red.add(mask)
    else blue = blue.add(mask)
  }

  // --- Edge needles -----------------------------------------------------
  // Thin, sparse, red-only spikes stabbing in from the top and bottom
  // edges: a narrow cubic taper per column, random reach per flicker step,
  // longest near the corners, and the bottom edge kept quieter than the top.
  const fromEdge = abs(screenUV.y.mul(2).sub(1)).oneMinus()
  const column = screenUV.x.mul(NEEDLE_COLUMNS).floor()
  const columnSeed = hash(column.add(flicker.mul(FLICKER_SALT)))
  const active = step(NEEDLE_DROPOUT, hash(column.add(17.3).add(flicker.mul(FLICKER_SALT))))

  const triangle = abs(fract(screenUV.x.mul(NEEDLE_COLUMNS)).mul(2).sub(1)).oneMinus()
  const thin = triangle.mul(triangle).mul(triangle)

  const cornerBoost = abs(screenUV.x.mul(2).sub(1))
    .pow(2)
    .mul(0.55)
    .add(0.45)
  const topWeight = mix(float(BOTTOM_EDGE_WEIGHT), float(1), step(0.5, screenUV.y))

  const reach = columnSeed
    .mul(NEEDLE_REACH)
    .mul(intensity)
    .mul(cornerBoost)
    .mul(topWeight)
  const needle = step(fromEdge, reach.mul(thin)).mul(active)

  // --- Composite --------------------------------------------------------
  const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)
  const withNeedles = mix(color, SENSE_RED, needle.mul(gate))
  const withCream = mix(withNeedles, CREAM, cream.clamp(0, 1).mul(gate))
  const withRed = mix(withCream, SENSE_RED, red.clamp(0, 1).mul(gate))
  return mix(withRed, SPIDER_BLUE, blue.clamp(0, 1).mul(gate))
})
```

- [ ] **Step 2: Typecheck and suite**

Run: `pnpm build && pnpm test`
Expected: build clean, all tests pass (no unit tests touch this file).

- [ ] **Step 3: Commit**

```bash
git add src/gl/post/spider-sense.ts
git commit -m "feat: redraw spider-sense as radial squiggles and thin edge needles"
```

---

### Task 2: Tap-to-pose

**Files:**
- Modify: `src/gl/logo/drag-rotate.ts`
- Test: `src/gl/logo/drag-rotate.test.ts` (add cases)
- Modify: `src/main.ts` (one line)

**Interfaces:**
- Consumes: existing `DragRotate` internals; `senseStep` wiring in `main.ts`.
- Produces: `shortestAngleDelta(from: number, to: number): number` and `poseStep(current: number, target: number, dt: number): number` (pure, exported for tests); `DragRotate.isPosing: boolean` getter; exported `POSE_YAW`, `POSE_PITCH` constants.

- [ ] **Step 1: Write the failing tests**

Append to `src/gl/logo/drag-rotate.test.ts`:

```ts
describe('shortestAngleDelta', () => {
  it('returns the plain difference when it is already short', () => {
    expect(shortestAngleDelta(0.2, 0.5)).toBeCloseTo(0.3, 10)
    expect(shortestAngleDelta(0.5, 0.2)).toBeCloseTo(-0.3, 10)
  })

  it('wraps across the seam instead of going the long way round', () => {
    // From just under a full turn to just past zero: the short path is
    // forward through the seam, not backward through almost 2π.
    expect(shortestAngleDelta(6.2, 0.1)).toBeCloseTo(0.1832853, 5)
    expect(shortestAngleDelta(0.1, 6.2)).toBeCloseTo(-0.1832853, 5)
  })

  it('never returns more than half a turn either way', () => {
    for (let from = -10; from < 10; from += 0.7) {
      for (let to = -10; to < 10; to += 0.9) {
        expect(Math.abs(shortestAngleDelta(from, to))).toBeLessThanOrEqual(Math.PI)
      }
    }
  })
})

describe('poseStep', () => {
  it('moves toward the target without overshooting', () => {
    const next = poseStep(0, 1, 0.016)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('is frame-rate independent', () => {
    const oneBigStep = poseStep(0, 1, 0.032)
    const twoSmallSteps = poseStep(poseStep(0, 1, 0.016), 1, 0.016)
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 10)
  })

  it('approaches through the wrap seam by the short path', () => {
    // Starting just under a full turn, the step must increase the angle
    // (pushing through 2π toward the target), not decrease it.
    expect(poseStep(6.2, 0.1, 0.1)).toBeGreaterThan(6.2)
  })

  it('does not move across a zero-length step', () => {
    expect(poseStep(0.4, 1, 0)).toBeCloseTo(0.4, 10)
  })
})
```

Update the test file's import to include the new symbols:

```ts
import {
  clampPitch,
  decayVelocity,
  MAX_PITCH,
  poseStep,
  shortestAngleDelta,
} from '@/gl/logo/drag-rotate'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- drag-rotate`
Expected: FAIL — `poseStep`/`shortestAngleDelta` not exported.

- [ ] **Step 3: Implement in `drag-rotate.ts`**

Add below the existing constants:

```ts
/**
 * The presentation pose a tap snaps the logo to, tuned by eye against the
 * reference screenshot. Radians.
 */
export const POSE_YAW = -0.45
export const POSE_PITCH = 0.18
/** Exponential time constant of the pose tween. Snappy but not instant. */
const POSE_TAU = 0.16
/** How long the pose (and the spider-sense burst) holds before idle resumes. */
const POSE_HOLD_SECONDS = 1.6
/** Pointer travel below this on release counts as a tap, not a drag. */
const TAP_MAX_TRAVEL_PX = 6

const TAU_RADIANS = Math.PI * 2

/** Signed shortest way from one angle to another, in (-π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  const raw = (((to - from + Math.PI) % TAU_RADIANS) + TAU_RADIANS) % TAU_RADIANS
  return raw - Math.PI
}

/**
 * One exponential step of the pose tween. Same frame-rate-independence
 * argument as `decayVelocity`; the delta goes through `shortestAngleDelta`
 * so an idle spin that has wound past 2π still tweens the short way.
 */
export function poseStep(current: number, target: number, dt: number): number {
  return current + shortestAngleDelta(current, target) * (1 - Math.exp(-dt / POSE_TAU))
}
```

In the `DragRotate` class:

1. Add fields next to the existing drag state:

```ts
  private posing = false
  private poseTimer = 0
  // Pointer distance accumulated during the current gesture, to tell a tap
  // from a drag on release.
  private travel = 0
```

2. Add the getter next to `isDragging`:

```ts
  /** True while the logo is tweening to (and holding) the tap pose. */
  get isPosing(): boolean {
    return this.posing
  }
```

3. In `onPointerDown`, after `this.dragging = true`: add

```ts
      this.posing = false
      this.travel = 0
```

4. In `onPointerMove`, before `this.lastX`/`this.lastY` are updated: add

```ts
      this.travel +=
        Math.abs(event.clientX - this.lastX) + Math.abs(event.clientY - this.lastY)
```

5. In `onPointerUp`, after `this.dragging = false`: add

```ts
      if (this.travel < TAP_MAX_TRAVEL_PX) {
        this.posing = true
        this.poseTimer = 0
        this.yawVelocity = 0
        this.pitchVelocity = 0
      }
```

6. In `update`, insert a posing branch between the dragging branch and the
   inertia branch:

```ts
    } else if (this.posing) {
      this.poseTimer += dt
      this.yaw = poseStep(this.yaw, POSE_YAW, dt)
      this.pitch = clampPitch(poseStep(this.pitch, POSE_PITCH, dt))
      if (this.poseTimer >= POSE_HOLD_SECONDS) this.posing = false
    } else {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- drag-rotate`
Expected: PASS, all cases including the new ones.

- [ ] **Step 5: Wire the burst in main**

In `src/main.ts`, the envelope tick currently reads `dragRotate.isDragging`.
Change it to:

```ts
  senseIntensity = senseStep(senseIntensity, dt, dragRotate.isDragging || dragRotate.isPosing)
```

- [ ] **Step 6: Typecheck and full suite**

Run: `pnpm build && pnpm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/gl/logo/drag-rotate.ts src/gl/logo/drag-rotate.test.ts src/main.ts
git commit -m "feat: tween the logo to a presentation pose on tap with a sense burst"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] Visual (controller): idle scene has no overlay; a tap spins the logo to the pose while squiggles ring the logo and red needles flash from the edges; a drag shows the same overlay and free rotation; everything decays ~1.5 s after.
- [ ] Tune `POSE_YAW`/`POSE_PITCH` and squiggle constants by eye against the reference screenshots.
