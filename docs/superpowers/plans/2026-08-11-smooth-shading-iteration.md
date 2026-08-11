# Smooth Shading Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the per-face brightness pops by reverting to the sketch-faithful smooth material + scene lights, bring back the idle spin, and thin the contour lines.

**Architecture:** Three reverts-with-history plus two constant tweaks. The material and lights come back verbatim from commit `7556698` (the pre-toon state); the idle spin comes back verbatim from the pre-`e1b2acd` state of `drag-rotate.ts`. Everything else (overlay, mask MRT, tap-to-pose, spheres) stays.

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest. pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 4")

## Global Constraints

- No `any`; strict mode; `noUnusedLocals`.
- Kebab-case file names. All code and comments in English.
- Commits: conventional prefixes, no `Co-Authored-By` lines.
- TSL nodes from `'three/tsl'`; classes/types from `'three/webgpu'`. Never import from bare `'three'`.
- The scene-pass MRT `mask` channel (default `float(1)`) must keep working: `MeshStandardNodeMaterial` is a NodeMaterial, so it inherits the pass default — no material change needed for the mask.

---

### Task 1: Smooth material, lights, idle spin, thinner lines

**Files:**
- Modify: `src/gl/materials/spider-verse-material.ts` (revert to the `7556698` version)
- Modify: `src/main.ts` (restore the three scene lights)
- Modify: `src/gl/logo/drag-rotate.ts` (restore idle spin)
- Modify: `src/gl/post/cartoon-effect.ts` (two constants)

**Interfaces:**
- `createSpiderVerseMaterial()` return type changes `MeshBasicNodeMaterial` → `MeshStandardNodeMaterial`. Consumers (`logo-mesh.ts`, `floating-spheres.ts`) only need the `Material` contract — no changes there.
- No other exported symbols change.

- [ ] **Step 1: Revert the material file**

Run: `git show 7556698:src/gl/materials/spider-verse-material.ts > src/gl/materials/spider-verse-material.ts`

That version is the faithful port: `MeshStandardNodeMaterial({ color: 0x808080, roughness: 0.2, metalness: 0.1 })` with the noise-driven `colorSpline` albedo and nothing else. Verify the file now imports only `mx_noise_float, positionWorld, smoothstep, uniform` from `three/tsl` and `MeshStandardNodeMaterial` from `three/webgpu`.

- [ ] **Step 2: Restore the scene lights in main**

In `src/main.ts`:

1. Extend the `three/webgpu` import to include `AmbientLight` and `DirectionalLight`.
2. After the `camera.position.set(...)` block and before `scene.add(createBackdrop())`, insert the light block exactly as it was in `7556698`:

```ts
// Two saturated keys from opposite sides, the way the film lights Miles: a red
// wash from screen right and a blue rim from screen left, with almost no fill
// so the middle stays dark and the colours never wash into each other. Kept
// dim overall because the contour blend extrapolates flat areas to 1.5x and
// `boost` adds another 1.1x on top.
const redKey = new DirectionalLight(0xff1a3c, 1.6)
redKey.position.set(3, 2, 3)
const blueRim = new DirectionalLight(0x2a4cff, 1.6)
blueRim.position.set(-3, -1, 1)
const fillLight = new AmbientLight(0x2a2a55, 0.25)
scene.add(redKey, blueRim, fillLight)
```

- [ ] **Step 3: Restore the idle spin**

In `src/gl/logo/drag-rotate.ts`:

1. Re-add the constants (below `DAMPING`):

```ts
const IDLE_YAW_SPEED = 0.15
/** Below this residual speed the idle spin takes back over. */
const IDLE_RESUME_VELOCITY = 0.05
```

2. In `update()`'s inertia branch, replace `this.yaw += this.yawVelocity * dt` with:

```ts
      const idleYaw = Math.abs(this.yawVelocity) < IDLE_RESUME_VELOCITY ? IDLE_YAW_SPEED : 0
      this.yaw += (this.yawVelocity + idleYaw) * dt
```

3. Update the class doc comment to promise the idle spin again: "…with inertia on release and a slow idle spin when it comes to rest. The tap pose holds briefly, then the idle spin resumes from it."

- [ ] **Step 4: Thin the contour**

In `src/gl/post/cartoon-effect.ts`, change the two uniform defaults:

```ts
  /** How far apart the Sobel taps sit — a wider contour line. */
  private readonly contour = uniform(2.5)
  /** Edge falloff, and stroke width for the screening layers. */
  private readonly thickness = uniform(0.8)
```

(Only the numbers change; keep the comments.)

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm test`
Expected: build clean, 35 tests green (no test covers the reverted paths).

- [ ] **Step 6: Commit**

```bash
git add src/gl/materials/spider-verse-material.ts src/main.ts src/gl/logo/drag-rotate.ts src/gl/post/cartoon-effect.ts
git commit -m "fix: return to smooth sketch shading, idle spin and finer contours"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] Visual (controller): logo brightness shifts smoothly while rotating — no face-wide dark/light/white pops; idle spin back; outlines noticeably finer; overlay + tap-to-pose still work.
