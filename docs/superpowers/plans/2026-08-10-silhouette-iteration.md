# Silhouette Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the squiggles outward, trace a silhouette contour around the logo and spheres, make the edge needles converge on screen centre, and stop the logo's idle spin.

**Architecture:** The scene pass MRT gains a `mask` channel (1 for objects, 0 for the backdrop via `material.mrtNode`); `spiderSense` becomes a plain function taking that mask texture and derives the offset contour from two angular-tap dilations. The needle field moves from x-columns to polar rays. Idle spin is deleted from `DragRotate`.

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 3")

## Global Constraints

- No `any`; strict mode; `noUnusedLocals`.
- Kebab-case file names. All code and comments in English.
- Path alias `@/*` → `./src/*`.
- Commits: conventional prefixes, no `Co-Authored-By` lines.
- TSL nodes from `'three/tsl'`; classes/types from `'three/webgpu'`. Never import from bare `'three'`.
- TSL pitfalls established on this branch: positional `mix(base, target, factor)` only; `smoothstep` edges ascending (invert with `.oneMinus()`).
- Shader-graph code is not unit-testable; visual verification is the controller's.

---

### Task 1: Silhouette overlay rework

**Files:**
- Modify: `src/gl/renderer.ts` (one line: MRT gains `mask`)
- Modify: `src/gl/backdrop.ts` (backdrop opts out of the mask)
- Modify: `src/gl/post/spider-sense.ts` (rewrite: radial squiggles, polar needles, contour)
- Modify: `src/gl/post/cartoon-effect.ts` (pass the mask texture through)

**Interfaces:**
- Consumes: `CREAM`, `SENSE_RED`, `SPIDER_BLUE` from `@/gl/palette`; `scenePass.getTextureNode('mask')`.
- Produces: `spiderSense(color: Node<'vec3'>, objectMask: TextureNode, intensity: Node<'float'>): Node<'vec3'>` — now a plain function (the `chromaticAberration` pattern), signature change consumed only by `cartoon-effect.ts` in this same task.

**API risk note for the implementer:** this task assumes (a) a constant
`float(1)` works as a pass-level MRT channel default, (b) `NodeMaterial.mrtNode`
on the backdrop material merges over the pass MRT and overrides that channel,
and (c) `scenePass.getTextureNode('mask').sample(uv)` is samplable at custom
coordinates (as `rtt(...)` textures are in `chromatic-aberration.ts`). All
three are standard three r185 node-API behavior, but if any fails to
typecheck or compile, adapt minimally (e.g. write the mask as
`vec4(float(1))`, or fall back to `uniform`-tagged materials) and record the
deviation with a reason in your report. Do not silently drop the contour.

- [ ] **Step 1: Add the mask channel to the pass MRT**

In `src/gl/renderer.ts`, extend the MRT (currently `mrt({ output, normal: normalView })`):

```ts
    scenePass.setMRT(mrt({ output, normal: normalView, mask: float(1) }))
```

Add `float` to the `three/tsl` import. Every material that does not say
otherwise now writes 1 into the mask buffer — objects are "on".

- [ ] **Step 2: Opt the backdrop out of the mask**

In `src/gl/backdrop.ts`, after `material.colorNode = ...`:

```ts
  // The silhouette mask the spider-sense contour dilates: the backdrop is
  // "off", everything else inherits the pass default of 1.
  material.mrtNode = mrt({ mask: float(0) })
```

Add `float, mrt` to the `three/tsl` import.

- [ ] **Step 3: Rewrite the overlay**

Replace `src/gl/post/spider-sense.ts` with:

```ts
// src/gl/post/spider-sense.ts
import {
  abs,
  atan,
  float,
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
import type { Node, TextureNode } from 'three/webgpu'

import { CREAM, SENSE_RED, SPIDER_BLUE } from '@/gl/palette'

/**
 * The spider-sense overlay, drawn the way the comics draw it: wavy strokes
 * radiating outward around the subject — Ditko's squiggles — a cream contour
 * tracing the silhouette at an offset, and thin red needles converging on
 * screen centre, as in the film's sense burst. One intensity value drives
 * everything; at 0 the overlay is a no-op. Quantizing time into flicker
 * steps re-randomizes phases and dropouts a few times a second, which reads
 * as hand-drawn frames instead of smooth motion.
 */

/** Re-randomizations per second. Comic-book shutter, not smooth motion. */
const FLICKER_HZ = 12
const TAU = 6.28318530718

/**
 * The squiggle ring. Angles walk the full circle unevenly, radii and lengths
 * vary, colours follow the references: mostly cream with a red and blue
 * accent pair. Units are aspect-corrected screen space, frame 1 unit tall.
 */
type SquiggleStroke = {
  /** Position angle on the ring, radians. */
  angle: number
  /** Ring radius from screen centre. */
  radius: number
  /** Stroke length along the radial axis. */
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

/** Needle rays around screen centre. */
const NEEDLE_RAYS = 48
/** Longest needle reach in from the top/bottom edge, fraction of height. */
const NEEDLE_REACH = 0.3
/** Fraction of rays silent per flicker step: hash above this fires. */
const NEEDLE_DROPOUT = 0.55
/** Bottom edge needles are dimmer/shorter than the top's. */
const BOTTOM_EDGE_WEIGHT = 0.35
/** Decorrelates the per-ray and per-stroke hashes between flicker steps. */
const FLICKER_SALT = 77.7

/** Contour: angular dilation taps and offsets, in physical pixels. */
const CONTOUR_TAPS = 12
const CONTOUR_OFFSET_PX = 16
const CONTOUR_WIDTH_PX = 4
/** Angular wobble that keeps the offset line from reading mechanical. */
const CONTOUR_WOBBLE_CYCLES = 9
const CONTOUR_WOBBLE_DEPTH = 0.25

/** Fades all masks in as intensity leaves zero, so decay tails vanish clean. */
const GATE_LOW = 0.02
const GATE_HIGH = 0.2

/**
 * Max of the mask over a ring of angular taps — a poor man's dilation. The
 * difference of two radii is a band tracing the silhouette at an offset.
 */
function dilate(objectMask: TextureNode, radiusPx: number): Node<'float'> {
  let acc: Node<'float'> = float(0)
  for (let tap = 0; tap < CONTOUR_TAPS; tap++) {
    const angle = (tap / CONTOUR_TAPS) * TAU
    const offset = vec2(Math.cos(angle) * radiusPx, Math.sin(angle) * radiusPx).div(
      screenSize
    )
    acc = acc.max(objectMask.sample(screenUV.add(offset)).r)
  }
  return acc
}

export function spiderSense(
  color: Node<'vec3'>,
  objectMask: TextureNode,
  intensity: Node<'float'>
): Node<'vec3'> {
  const flicker = time.mul(FLICKER_HZ).floor()

  // Aspect-corrected, centred: the frame is 1 unit tall, origin mid-screen.
  const p = screenUV.sub(0.5).mul(vec2(screenSize.x.div(screenSize.y), 1))
  const theta = atan(p.y, p.x)

  // --- Radial squiggles -------------------------------------------------
  // Local frame per stroke: `along` runs OUTWARD along the radius (the
  // references show the strokes radiating like small flames), `across` runs
  // tangentially. A sine bends the centreline, a parabolic taper plus a hard
  // window sharpens the tips, and a per-step hash redraws the phase.
  let cream: Node<'float'> = float(0)
  let red: Node<'float'> = float(0)
  let blue: Node<'float'> = float(0)

  for (const [index, stroke] of SQUIGGLES.entries()) {
    const cosA = Math.cos(stroke.angle)
    const sinA = Math.sin(stroke.angle)
    const rel = p.sub(vec2(cosA * stroke.radius, sinA * stroke.radius))
    const along = rel.x.mul(cosA).add(rel.y.mul(sinA))
    const across = rel.x.mul(-sinA).add(rel.y.mul(cosA))

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
    // Hard cut at the tips: the taper thins the width, but on its own it
    // still leaves a hairline along the infinite centreline.
    const window = step(tip, float(1))
    const alive = step(STROKE_DROPOUT, hash(flicker.add(index * 13.13 + 3.7)))
    const mask = body.mul(window).mul(alive)

    if (stroke.color === 'cream') cream = cream.add(mask)
    else if (stroke.color === 'red') red = red.add(mask)
    else blue = blue.add(mask)
  }

  // --- Silhouette contour ----------------------------------------------
  // Dilate the object mask at two radii; the difference is an annulus band
  // tracing the logo and spheres at a fixed offset. A low-frequency angular
  // wobble keeps the line hand-drawn instead of mechanical.
  const outer = dilate(objectMask, CONTOUR_OFFSET_PX)
  const inner = dilate(objectMask, CONTOUR_OFFSET_PX - CONTOUR_WIDTH_PX)
  const band = outer.sub(inner).clamp(0, 1)
  const wobble = sin(theta.mul(CONTOUR_WOBBLE_CYCLES).add(hash(flicker.mul(3.3)).mul(6.28)))
    .mul(CONTOUR_WOBBLE_DEPTH)
    .add(1 - CONTOUR_WOBBLE_DEPTH)
  const contour = band.mul(wobble)

  // --- Converging needles -----------------------------------------------
  // Polar rays around screen centre, clipped to the top/bottom edge zones:
  // constant angular width means each ray is wide at the frame edge and
  // sharpens toward the centre — every needle points at the middle.
  const ray = theta.div(TAU).add(0.5).mul(NEEDLE_RAYS)
  const rayIndex = ray.floor()
  const raySeed = hash(rayIndex.add(flicker.mul(FLICKER_SALT)))
  const active = step(NEEDLE_DROPOUT, hash(rayIndex.add(17.3).add(flicker.mul(FLICKER_SALT))))

  const triangle = abs(fract(ray).mul(2).sub(1)).oneMinus()
  const thin = triangle.mul(triangle).mul(triangle)

  const fromEdge = abs(screenUV.y.mul(2).sub(1)).oneMinus()
  const cornerBoost = abs(screenUV.x.mul(2).sub(1)).pow(2).mul(0.55).add(0.45)
  // Assumes screenUV.y grows upward (top = y > 0.5); flip the mix if the
  // backend disagrees — verified visually.
  const topWeight = mix(float(BOTTOM_EDGE_WEIGHT), float(1), step(0.5, screenUV.y))

  const reach = raySeed.mul(NEEDLE_REACH).mul(intensity).mul(cornerBoost).mul(topWeight)
  const needle = step(fromEdge, reach.mul(thin)).mul(active)

  // --- Composite --------------------------------------------------------
  const gate = smoothstep(GATE_LOW, GATE_HIGH, intensity)
  const withNeedles = mix(color, SENSE_RED, needle.mul(gate))
  const withContour = mix(withNeedles, CREAM, contour.mul(gate))
  const withCream = mix(withContour, CREAM, cream.clamp(0, 1).mul(gate))
  const withRed = mix(withCream, SENSE_RED, red.clamp(0, 1).mul(gate))
  return mix(withRed, SPIDER_BLUE, blue.clamp(0, 1).mul(gate))
}
```

Note the file no longer imports `Fn` if unused after the rewrite — drop any
import the final code does not use (`noUnusedLocals` also applies to
imports via `verbatimModuleSyntax`; the build will tell you).

- [ ] **Step 4: Pass the mask through in CartoonEffect**

In `src/gl/post/cartoon-effect.ts`, `buildComposite`, change the final return:

```ts
    return vec4(
      spiderSense(screened.mul(grain), scenePass.getTextureNode('mask'), this.senseIntensity),
      1
    )
```

- [ ] **Step 5: Typecheck and suite**

Run: `pnpm build && pnpm test`
Expected: clean, 35 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/gl/renderer.ts src/gl/backdrop.ts src/gl/post/spider-sense.ts src/gl/post/cartoon-effect.ts
git commit -m "feat: trace the silhouette and converge the sense lines on centre"
```

---

### Task 2: Remove the idle spin

**Files:**
- Modify: `src/gl/logo/drag-rotate.ts`

**Interfaces:**
- Consumes/produces: no exported symbol changes. `main.ts` untouched.

- [ ] **Step 1: Delete the idle behavior**

In `src/gl/logo/drag-rotate.ts`:

1. Delete the `IDLE_YAW_SPEED` and `IDLE_RESUME_VELOCITY` constants and their comments.
2. In `update()`'s inertia branch, replace

```ts
      const idleYaw = Math.abs(this.yawVelocity) < IDLE_RESUME_VELOCITY ? IDLE_YAW_SPEED : 0
      this.yaw += (this.yawVelocity + idleYaw) * dt
```

with

```ts
      this.yaw += this.yawVelocity * dt
```

3. Update the class doc comment: it currently promises "a slow idle spin
   when it comes to rest" — the logo now rests still and moves only when
   touched.

- [ ] **Step 2: Typecheck and suite**

Run: `pnpm build && pnpm test`
Expected: clean, 35 tests green (no test covers the idle spin).

- [ ] **Step 3: Commit**

```bash
git add src/gl/logo/drag-rotate.ts
git commit -m "feat: keep the logo still until touched"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] Visual (controller): logo rests still, spheres drift; on tap/drag the squiggles radiate outward, a cream wobbling contour hugs the logo and sphere silhouettes, red needles from the top/bottom edges all point at screen centre.
- [ ] Tune `CONTOUR_OFFSET_PX`, squiggle ring, and `NEEDLE_RAYS` by eye.
