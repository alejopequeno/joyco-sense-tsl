# User Squiggles + Paper Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the user's travelling-arc squiggle module from their experiment branch, and re-light the scene the way the reference sketch does (neutral light, roughness 0.4, beige paper blend, desaturated backdrop).

**Architecture:** Task 1 vendors five modules verbatim from `backup/experiments-2026-08-11` — the `spiderSense` signature is unchanged, so the post chain keeps calling it as-is. Task 2 is four small look edits (lights, roughness, paper blend, backdrop softening).

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest. pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 5")

## Global Constraints

- No `any`; strict mode; `noUnusedLocals`.
- Kebab-case file names. All code and comments in English.
- Commits: conventional prefixes, no `Co-Authored-By` lines.
- TSL nodes from `'three/tsl'`; classes/types from `'three/webgpu'`. Never import from bare `'three'`.
- Vendored files are taken verbatim from `backup/experiments-2026-08-11` — do not rewrite them; adapt ONLY if an import target does not exist on this branch, and record every adaptation.

---

### Task 1: Vendor the user's squiggle module

**Files:**
- Create (from the backup branch): `src/gl/look.ts`, `src/gl/nodes/morphology.ts`, `src/gl/post/spider-sense-geometry.ts`, `src/gl/post/spider-sense-geometry.test.ts`, `src/gl/post/spider-sense.test.ts`
- Overwrite: `src/gl/post/spider-sense.ts`

**Interfaces:**
- Produces: `spiderSense(color: Node<'vec3'>, logoMask: TextureNode, intensity: Node<'float'>): Node<'vec3'>` — same signature as current, so `cartoon-effect.ts` needs no change in this task.
- The vendored `spider-sense.ts` imports `MILES_LOOK` from `@/gl/look`, `dilateDisc` from `@/gl/nodes/morphology`, `GESTURE_CAPSULES` from `@/gl/post/spider-sense-geometry`, and `CREAM`/`SENSE_RED`/`SPIDER_BLUE` from `@/gl/palette` (all exist on this branch).

- [ ] **Step 1: Vendor the files**

```bash
git show backup/experiments-2026-08-11:src/gl/look.ts > src/gl/look.ts
git show backup/experiments-2026-08-11:src/gl/nodes/morphology.ts > src/gl/nodes/morphology.ts
git show backup/experiments-2026-08-11:src/gl/post/spider-sense-geometry.ts > src/gl/post/spider-sense-geometry.ts
git show backup/experiments-2026-08-11:src/gl/post/spider-sense-geometry.test.ts > src/gl/post/spider-sense-geometry.test.ts
git show backup/experiments-2026-08-11:src/gl/post/spider-sense.test.ts > src/gl/post/spider-sense.test.ts
git show backup/experiments-2026-08-11:src/gl/post/spider-sense.ts > src/gl/post/spider-sense.ts
```

Also check for a morphology test on that branch and vendor it if present:

```bash
git show backup/experiments-2026-08-11:src/gl/nodes/morphology.test.ts > src/gl/nodes/morphology.test.ts 2>/dev/null || rm -f src/gl/nodes/morphology.test.ts
```

- [ ] **Step 2: Resolve imports**

Run `pnpm build`. If any vendored file imports a module that does not exist on this branch (their experiment tree had `reference-*` modules we are NOT vendoring), fix by the narrowest possible edit — e.g. inline the needed constant — and record the deviation in your report. Do not vendor additional files beyond the list without recording why.

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm test`
Expected: build clean; the suite grows by the vendored tests and everything passes.

- [ ] **Step 4: Commit**

```bash
git add src/gl/look.ts src/gl/nodes/morphology.ts src/gl/post/
git commit -m "feat: adopt the travelling-arc spider-sense module from the experiment branch"
```

---

### Task 2: Sketch-faithful light and paper

**Files:**
- Modify: `src/gl/materials/spider-verse-material.ts` (one value)
- Modify: `src/main.ts` (lights block)
- Modify: `src/gl/backdrop.ts` (soften the duotone)
- Modify: `src/gl/post/cartoon-effect.ts` (paper blend)

**Interfaces:** no exported symbol changes.

- [ ] **Step 1: Roughness**

In `src/gl/materials/spider-verse-material.ts`, change `roughness: 0.2` to `roughness: 0.4` (the reference sketch's own panel value).

- [ ] **Step 2: Neutral lights**

In `src/main.ts`, replace the `redKey`/`blueRim`/`fillLight` block (declarations, comment and `scene.add`) with:

```ts
// The sketch lights its scene neutrally and lets the material's colour
// spline do the talking: a warm white key from the upper right (where the
// reference's highlights sit), a dim cool fill from the left so shadows
// lean blue instead of black, and a warm ambient floor.
const keyLight = new DirectionalLight(0xfff2e0, 2.6)
keyLight.position.set(2.5, 3, 4)
const coolFill = new DirectionalLight(0xbfd0ff, 0.9)
coolFill.position.set(-3, -1, 2)
const ambient = new AmbientLight(0xfff0dd, 0.55)
scene.add(keyLight, coolFill, ambient)
```

(`AmbientLight`/`DirectionalLight` imports already present.)

- [ ] **Step 3: Soften the backdrop duotone**

In `src/gl/backdrop.ts`, the duotone currently mixes raw `SPIDER_BLUE` ↔ `SPIDER_RED`. Pull both toward cream, matching the sketch's salmon / dusty blue:

```ts
// The film palette at print strength: pulled toward the paper so the field
// reads salmon / dusty blue like the sketch, not poster-saturated.
const BLUE_SOFTEN = 0.35
const RED_SOFTEN = 0.45
```

and change the duotone line to:

```ts
  const duotone = mix(
    mix(SPIDER_BLUE, CREAM, BLUE_SOFTEN),
    mix(SPIDER_RED, CREAM, RED_SOFTEN),
    smoothstep(DUOTONE_EDGE_LOW, DUOTONE_EDGE_HIGH, duotoneNoise)
  )
```

- [ ] **Step 4: Paper sheet blend**

In `src/gl/post/cartoon-effect.ts`, `buildComposite` currently ends by multiplying the grain in (`screened.mul(grain)` inside the `spiderSense(...)` call). Port the sketch's actual paper composite — `blendDarken` against a beige sheet — so bright areas cap to warm paper carrying the grain:

1. Add a module constant near the other colour constants:

```ts
// The sketch blends a Parchment scan over the frame with blendDarken: the
// brightest areas cap to warm paper instead of clipping to white. This is
// that sheet, procedurally — the grain modulates it.
const PAPER_SHEET = vec3(0.93, 0.88, 0.78)
```

2. Replace the final composite expression: where the code currently passes `screened.mul(grain)` into `spiderSense(...)`, build the papered colour first and pass that instead:

```ts
    const papered = blendDarken(screened, PAPER_SHEET.mul(grain), float(1))
```

then `spiderSense(papered, ...)` in the returned `vec4`. Check `blendDarken`'s exact parameter order/types against `src/gl/nodes/blend.ts` before writing the call (the existing contour usage in this same file is the reference), and add `float` to the `three/tsl` import if not already there.

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm test`
Expected: clean, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/gl/materials/spider-verse-material.ts src/main.ts src/gl/backdrop.ts src/gl/post/cartoon-effect.ts
git commit -m "feat: relight the scene to the sketch's neutral paper look"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] Visual (controller/user): squiggles travel continuously (no flicker jumps); scene reads bright and papery — cream highlights with grain, salmon/dusty-blue field, spline colours visible on logo and spheres instead of uniform maroon; halftone dots visible across mid-tones.
- [ ] Tuning knobs if needed: light intensities in `main.ts`, `BLUE_SOFTEN`/`RED_SOFTEN`, `PAPER_SHEET`.
