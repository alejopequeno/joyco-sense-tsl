# Spidey Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the sketch-inherited colours for canonical Spider-Man ones: suit ramp in the material spline, suit red/blue in the shared palette, film magenta accent, less-washed backdrop.

**Architecture:** Constants only — three files, no structural changes.

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vitest. pnpm.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 6")

## Global Constraints

- No `any`; strict; `noUnusedLocals`. English comments. Conventional commit, no `Co-Authored-By`.
- Colour values are raw sRGB fractions (`x/255` style), matching the files' existing convention. Do not introduce `color()` nodes or `Color` conversions.

---

### Task 1: Canonical colours

**Files:**
- Modify: `src/gl/nodes/color-spline.ts` (STOPS)
- Modify: `src/gl/palette.ts` (three values)
- Modify: `src/gl/backdrop.ts` (two constants)

**Interfaces:** no signature changes anywhere.

- [ ] **Step 1: Suit ramp in the spline**

In `src/gl/nodes/color-spline.ts`, replace the `STOPS` array and its comment:

```ts
// The classic suit ramp: near-black navy, suit blue, dark red, suit red,
// cold pale highlight — #03071E, #2B3784, #B11313, #DF1F2D, #D7DEFF.
const STOPS = [
  vec3(3 / 255, 7 / 255, 30 / 255),
  vec3(43 / 255, 55 / 255, 132 / 255),
  vec3(177 / 255, 19 / 255, 19 / 255),
  vec3(223 / 255, 31 / 255, 45 / 255),
  vec3(215 / 255, 222 / 255, 255 / 255),
] as const
```

- [ ] **Step 2: Shared palette**

In `src/gl/palette.ts`, change three values (comments stay, update the hex mentions if the comments carry any):

```ts
export const SPIDER_BLUE: Node<'vec3'> = vec3(43 / 255, 55 / 255, 132 / 255)
export const SPIDER_RED: Node<'vec3'> = vec3(223 / 255, 31 / 255, 45 / 255)
export const SPIDER_MAGENTA: Node<'vec3'> = vec3(255 / 255, 25 / 255, 115 / 255)
```

`SENSE_RED`, `CREAM`, `INK_COLOR` stay as they are.

- [ ] **Step 3: Ease the backdrop softening**

In `src/gl/backdrop.ts`:

```ts
const BLUE_SOFTEN = 0.2
const RED_SOFTEN = 0.3
```

- [ ] **Step 4: Verify**

Run: `pnpm build && pnpm test`
Expected: clean, 49 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/gl/nodes/color-spline.ts src/gl/palette.ts src/gl/backdrop.ts
git commit -m "feat: adopt the canonical spider-man suit palette"
```

---

## Final Verification

- [ ] Visual (user): logo and spheres read as suit red/blue blotches with pale highlights; backdrop red/blue over paper; sense accents magenta/red.
