# 3D Logo with Drag Rotation — Design

Date: 2026-08-10
Status: approved

## Goal

Bootstrap a Three.js + TSL playground. First milestone: render the JOYCO-style
logo as an extruded 3D solid and let the user rotate it by dragging, with
inertia on release.

TSL node materials are the reason this project exists, but they are explicitly
**not** in this milestone. The milestone ends with a plain lit material so the
volume reads correctly; the node graph replaces it next.

## Stack

- Vite + TypeScript, no framework.
- `three@^0.185`, importing from `three/webgpu` (renderer + node materials) and
  `three/tsl` (nodes, later).
- `WebGPURenderer`. Three falls back to WebGL2 on its own when WebGPU is
  unavailable.
- vitest for unit tests on pure functions.

No React, no R3F, no Next. The scene has no GLB content and no declarative tree
worth reconciling, so the reference architecture is `JOYCO/internal/jam` (vanilla
`gl/` layer) rather than `JOYCO/clients/bzrp` (R3F).

## Structure

```
src/
  main.ts                    // wires canvas, scene, camera, logo, drag
  gl/
    renderer.ts              // Renderer class: async init, sizing/DPR, render slot
    ticker.ts                // rAF loop with dt and priorities
    dispose.ts               // Disposer: unwinds registrations newest-first
    logo/
      logo-shape.ts          // THREE.Shape for the logo, centered on origin
      logo-mesh.ts           // ExtrudeGeometry + material
      drag-rotate.ts         // pointer-driven rotation controller
```

`Renderer` is pure TypeScript and knows nothing about scene contents — it owns
backend negotiation, sizing, and the render slot. `main.ts` is the only module
that knows about every piece.

## Geometry

Source SVG lives in `.context/`, which is gitignored, so it is copied into the
repo at `assets/logo.svg` as the committed source of truth. Nothing loads it at
runtime — it exists so the hardcoded points can be re-derived later.

It is one `viewBox="0 0 160 144"` path, a single closed subpath, no holes, all
straight segments:

```
M136 96 L88 144 H0 V40 H64 V112 H80 V24 H0 V0 H160 V24 H136 V96 Z
```

That is 13 unique points. `logo-shape.ts` writes them out as a `THREE.Shape`
directly — no `SVGLoader`, no fetch, no async.

Two transforms are baked into the point coordinates, not applied to the mesh:

- **Y flip**: `y = 72 - y_svg`. SVG's Y axis points down. Doing this with
  `mesh.scale.y = -1` or `geometry.scale(1, -1, 1)` reverses triangle winding and
  leaves the normals pointing inward.
- **Centering**: `x = x_svg - 80`. The logo then rotates about its own center
  rather than a corner.

Normalized to height 1 (divide by 144), so the mesh scale is expressed in whole
units.

Trade-off accepted: swapping the logo means rewriting the points. In exchange:
no loader dependency, no async, no winding surprises, and exact control over the
pivot.

Extrusion via `ExtrudeGeometry`:
- `depth` ≈ 0.2 of the logo height.
- Bevel enabled, small `bevelThickness` / `bevelSize`, `bevelSegments: 3`. The
  bevel is what catches light along the edges — without it the solid reads as a
  flat sticker.

## Drag rotation

`drag-rotate.ts` exposes a controller that takes an `Object3D` and a target
element. It does not know about the logo specifically.

- `pointerdown` / `pointermove` / `pointerup` on the canvas, with
  `setPointerCapture` so the gesture survives the pointer leaving the element.
- `touch-action: none` on the canvas. Without it the browser claims horizontal
  drags for scroll / back-navigation and kills the pointer stream with a
  `pointercancel` (same issue documented in `bzrp/lib/renderer.ts:9`).
- Yaw (Y axis) and pitch (X axis) tracked as separate scalars, not a quaternion
  trackball: more predictable, and no accumulated roll.
- Pitch clamped to ±80° so the logo never ends up edge-on.
- **Inertia**: angular velocity is captured from the last pointer delta. On
  release it decays as `v *= Math.exp(-k * dt)` — frame-rate independent, unlike
  a per-frame `v *= 0.95`.
- **Idle**: with no drag and no residual velocity, a slow constant yaw keeps the
  object alive.

## Material (provisional)

`MeshStandardNodeMaterial` with one directional light and one ambient light.
Zero TSL. Its only job is to make the extrusion and bevel legible. The next
milestone replaces it with a node graph (fresnel + cosine palette).

## Render loop

One ticker for the whole app. `Renderer.init()` is async because WebGPU
negotiates its device asynchronously; nothing renders and no size is applied
until it resolves.

The WebKit ordering bug that `jam/gl/renderer.ts:47` works around (Safari's
WebGPU backend presenting drawables out of order, forcing a WebGL2 fallback) is
noted but not implemented here.

## Testing

vitest, covering pure functions only:

- The logo shape's bounding box is centered on the origin and has height 1.
- The inertia decay produces the same result across different `dt` step sizes
  (one 32ms step vs two 16ms steps).

Visual correctness — the logo not being mirrored, the bevel catching light — is
verified by eye.

## Out of scope

TSL node material, post-processing pipeline, Tweakpane debug layer, multiple
scenes, WebKit fallback logic.
