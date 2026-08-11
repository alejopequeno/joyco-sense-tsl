# Debug Pane Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port JOYCO jam's debug system (shared Tweakpane behind `?debug`/OPT+D, scene tooling, stats-gl perf HUD, declarative knob schema) into this repo, and expose the look's tuning knobs through it.

**Architecture:** Task 1 ports the three source modules from the jam repo, adapting their engine couplings (Tempus ticker singleton → this repo's `Ticker` instance carried in the scene context; jam's `Disposer` → ours, same shape). Task 2 wires the pane into `Renderer`/`main` and converts the tuned-blind constants (post uniforms already exist; paper sheet and backdrop softens become uniforms) into registered knobs.

**Source material (read, adapt — do not import across repos):**
- `/Users/alejopequeno/Documents/Work/JOYCO/internal/jam/lib/debug.ts` (418 lines — schema/binding helpers)
- `/Users/alejopequeno/Documents/Work/JOYCO/internal/jam/gl/perf-monitor.ts` (112 lines)
- `/Users/alejopequeno/Documents/Work/JOYCO/internal/jam/gl/debug-tools.ts` (447 lines)
- Wiring reference: `/Users/alejopequeno/Documents/Work/JOYCO/internal/jam/gl/renderer.ts` lines ~140-175

**Tech Stack:** three ^0.185 WebGPU + TSL, TypeScript strict, Vite, Vitest, pnpm. New deps: `tweakpane`, `@tweakpane/core`, `stats-gl`.

**Spec:** `docs/superpowers/specs/2026-08-10-spider-verse-toon-design.md` (section "Iteration 7")

## Global Constraints

- No `any`; strict mode; `noUnusedLocals`; `exactOptionalPropertyTypes` is ON.
- Kebab-case file names. All code and comments in English. Path alias `@/*`.
- Commits: conventional prefixes, no `Co-Authored-By` lines.
- TSL nodes from `'three/tsl'`; classes/types from `'three/webgpu'`. The jam code imports `* as THREE from "three"` — this repo forbids bare `'three'`; adapt imports to `'three/webgpu'` (classes) and `'three/addons/...'` (OrbitControls).
- The pane must stay out of the player runtime: Tweakpane/OrbitControls/stats-gl load via dynamic `import()` only when the pane is shown, exactly as the jam source does. Preserve that structure.
- Jam's ticker is Tempus (`ticker.add((time, deltaTimeMs) => ..., { priority })`, global singleton). This repo's is `Ticker` (`ticker.add((dtSeconds) => ..., priority)`, instance owned by `main`). Adapt every ticker touchpoint; the debug singleton receives the ticker through `SceneContext`.
- Jam's `data-ui` host attribute may be kept (harmless here) but nothing in this repo depends on it.

---

### Task 1: Port the debug modules

**Files:**
- Create: `src/gl/debug/schema.ts` (from jam `lib/debug.ts`)
- Create: `src/gl/debug/perf-monitor.ts` (from jam `gl/perf-monitor.ts`)
- Create: `src/gl/debug/debug-tools.ts` (from jam `gl/debug-tools.ts`)
- Modify: `package.json` (via `pnpm add tweakpane @tweakpane/core stats-gl`)

**Interfaces:**
- Produces: a module-level `debug` singleton from `@/gl/debug/debug-tools` with at least:
  - `debug.folder(title: string, build: (folder: FolderApi) => void | (() => void), options?: { expanded?: boolean }): () => void` — registers a knob folder; returns a disposer; folders registered while hidden must load when the pane is later shown (keep jam's pending-set behavior).
  - `debug.attachScene(ctx: SceneContext): () => void` where `SceneContext` = `{ scene, camera, canvas, renderer, ticker, setRenderCamera }` — jam's shape plus `ticker: Ticker` (this repo's instance), consumed wherever jam used its global ticker.
  - Re-export the schema helpers (`bindSchema`, `addCopyButton`, types) as jam does.
- `?debug` URL gating and the OPT+D live toggle preserved verbatim in behavior.
- Consumes: `Disposer` from `@/gl/dispose`, `PRIORITY`/`Ticker` from `@/gl/ticker`.

- [ ] **Step 1: Install dependencies**

Run: `pnpm add tweakpane @tweakpane/core stats-gl`

- [ ] **Step 2: Port `lib/debug.ts` → `src/gl/debug/schema.ts`**

Read the jam source in full first. Port verbatim where possible; adapt only imports (this file should be tweakpane-typed helpers with no engine coupling — if it imports anything jam-specific, adapt narrowly and record it).

- [ ] **Step 3: Port `gl/perf-monitor.ts` → `src/gl/debug/perf-monitor.ts`**

Adapt the ticker touchpoints to this repo's `Ticker` (`add(cb, priority)` returning a remover; `dt` in seconds). stats-gl import stays dynamic if jam has it so; match jam's mount/unmount contract.

- [ ] **Step 4: Port `gl/debug-tools.ts` → `src/gl/debug/debug-tools.ts`**

- `import * as THREE from "three"` → named imports from `'three/webgpu'`.
- OrbitControls: dynamic `import('three/addons/controls/OrbitControls.js')` (keep it lazy).
- Global `ticker` import → the `ticker` carried in `SceneContext`; any per-frame debug work (camera monitor, explore sync) registers on that instance with the appropriate `PRIORITY`.
- `Disposer` → `@/gl/dispose` (same `.add(fn)` / `.dispose()` shape).
- Keep: URL param gating, OPT+D handler, dynamic Pane import, pending folder set, explore-orbit camera clone + `syncFrustum`, perf toggle, copy button wiring.
- Record every structural deviation from the jam source in your report.

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm test`
Expected: build clean (the new modules compile; nothing imports them yet), 49 tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/gl/debug/
git commit -m "feat: port the jam debug pane, schema and perf monitor"
```

---

### Task 2: Wire the pane and expose the knobs

**Files:**
- Modify: `src/gl/renderer.ts`
- Modify: `src/gl/post/cartoon-effect.ts`
- Modify: `src/gl/backdrop.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: the `debug` singleton and `SceneContext` from Task 1.
- Produces:
  - `RendererOptions` gains `debug?: { attachScene(ctx: SceneContext): () => void }` — after init, the renderer attaches the scene context; the returned disposer joins the renderer's `Disposer`. `setRenderCamera` is implemented by reassigning the scene pass's camera: keep a reference to the `pass(scene, camera)` node and set `scenePass.camera = cam ?? camera` (verify the `PassNode.camera` property is read per-render in three's source; if it is not, rebuild-free fallback: keep a mutable camera holder object — record which route was taken).
  - `CartoonEffect.registerDebug(folder: FolderApi): void` — binds the existing uniforms (`contour`, `thickness`, `boost`, `scale`, `dark`, `mid`, `light`, `aberration`, `senseAberrationBoost`) with sensible ranges, plus the paper sheet: convert the `PAPER_SHEET` graph constant to a `uniform(new Color(0.93, 0.88, 0.78))` so it binds as a colour knob.
  - `createBackdrop()` return changes to `{ mesh: Mesh; registerDebug(folder: FolderApi): void }`: `BLUE_SOFTEN`, `RED_SOFTEN`, `PATCH_LIFT` become `uniform(...)` nodes (defaults 0.08 / 0.12 / 0.55) bound as 0–1 sliders.
  - `main.ts`: passes `debug` to the `Renderer`, updates the backdrop call (`scene.add(backdrop.mesh)`), and registers two folders: `"post"` (collapsed, `cartoon.registerDebug`) and `"look"` (backdrop knobs + the three lights' intensities and colours — bind `light.intensity` and `light.color` directly).

- [ ] **Step 1: Renderer**

Add the optional `debug` to `RendererOptions`; in the post-init continuation (after the pipeline is built), call `attachScene` with `{ scene, camera, canvas: this.canvas, renderer, ticker, setRenderCamera }` and register the disposer. Follow the jam renderer's wiring (source lines ~140-175) adapted to this class's structure.

- [ ] **Step 2: CartoonEffect knobs**

`registerDebug(folder)` binding each uniform's `.value` via tweakpane (`folder.addBinding(uniform, 'value', { label, min, max, step })`). Ranges: contour 0–8, thickness 0–2, boost 0.5–2, scale 0.5–4, dark/mid/light 0–1, aberration 0–300, senseAberrationBoost 0–400. Paper sheet: `uniform(new Color(...))` + colour binding (`{ color: { type: 'float' } }`).

- [ ] **Step 3: Backdrop knobs**

Convert the three constants to uniforms used in the colour graph, return `{ mesh, registerDebug }`, bind 0–1 sliders.

- [ ] **Step 4: main wiring**

Import `debug`, pass to Renderer, fix the backdrop call, register the `"post"` and `"look"` folders. Folder registrations return disposers — this app is page-lifetime, so dropping them is acceptable; match however `main.ts` treats other lifetime objects.

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm test`
Expected: clean, 49 green. Then run `pnpm dev` headlessly if possible only to confirm no immediate runtime import error (optional; the controller does the visual pass).

- [ ] **Step 6: Commit**

```bash
git add src/gl/renderer.ts src/gl/post/cartoon-effect.ts src/gl/backdrop.ts src/main.ts
git commit -m "feat: expose the look through the debug pane"
```

---

## Final Verification

- [ ] `pnpm build && pnpm test` — clean.
- [ ] Visual (user): plain URL shows no pane and loads no tweakpane chunk; `?debug` (or OPT+D) shows the pane with scene tooling, perf HUD, "post" and "look" folders; sliders change the render live; explore-orbit works and restores.
