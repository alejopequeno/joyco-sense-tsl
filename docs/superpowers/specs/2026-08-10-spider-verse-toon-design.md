# Spider-Verse Toon Scene — Design

**Date:** 2026-08-10
**Status:** Approved

## Goal

Restage the scene with the rendering technique of spite's `post-cartoon-iii` sketch
(https://spite.github.io/sketch/post-cartoon-iii/index.html) — toon banded lighting,
halftone dots in lit areas, diagonal hatching in penumbra, dark contour outlines,
soft blobby background, paper grain, chromatic aberration — but with the
Spider-Verse red/blue palette from the Miles Morales spider-sense reference image,
not the sketch's warm cream palette. Add floating spheres around the logo and a
drag-triggered spider-sense overlay (jagged red edge spikes + wavy squiggles).

## References

- `post-cartoon-iii` sketch: rendering technique (toon ramp, halftone-in-light,
  outlines, blobby background, paper, aberration).
- Miles Morales spider-sense still: palette (deep blue / red duotone, magenta
  accents, cream highlights) and spider-sense visual language (jagged spikes
  entering from screen edges, wavy squiggles floating over the backdrop).

The sketch is WebGL/GLSL; this project is WebGPU/TSL. Techniques are ported,
never copied verbatim. Several nodes are already ported and reused.

## Scene

- The extruded logo stays the hero, keeping existing drag rotation with inertia
  and idle spin (`drag-rotate.ts`).
- 5–7 floating spheres around the logo: slow orbital drift, varied scales and
  radii, same toon material as the logo. They sell depth like the sketch.

## Toon material (rework `src/gl/materials/spider-verse-material.ts`)

post-cartoon-iii shading model, in TSL:

- Banded (ramp) diffuse lighting.
- Flat clipped specular highlight.
- Rim light.
- Luma-driven surface layers:
  - lit areas: fine halftone dots (existing `nodes/halftone.ts`)
  - penumbra: diagonal hatching (existing hatching in the post chain)
  - shadow: flat deep colour
- Dark contour outlines via Sobel over MRT normals (existing
  `nodes/sobel.ts` + `post/cartoon-effect.ts`).

## Background (rework `src/gl/backdrop.ts`)

- Soft blobby radial light patches, like the sketch, but mapping
  deep blue ↔ red (Spider-Verse duotone) instead of cream/brown.
- Ben-day dots in the tonal transition zones (existing).
- Subtle paper grain overlay (existing `nodes/paper.ts`).

## Palette

- Background: deep blue ↔ red duotone, magenta accents.
- Logo/spheres: reds/magentas with cream highlights.
- No warm cream/coffee tones from the original sketch.

## Spider-sense overlay (new `src/gl/post/spider-sense.ts`)

- Reactive, not always-on: dragging/touching the logo drives an intensity
  value — fast attack, ~1.5 s decay after release. Fed from `drag-rotate.ts`.
- Full-screen post overlay driven by the intensity uniform:
  - jagged red spikes entering from the screen edges (polar SDF + noise,
    animated flicker) — the film's spider-sense language;
  - wavy squiggle lines appearing over the backdrop;
  - chromatic aberration amplified by intensity (existing pass, scaled).
- At intensity 0 the overlay contributes nothing.

## Architecture

New:
- `src/gl/spheres/floating-spheres.ts` — sphere group, drift animation.
- `src/gl/post/spider-sense.ts` — overlay node, intensity uniform.

Reworked:
- `src/gl/backdrop.ts` — blobby gradient + palette.
- `src/gl/materials/spider-verse-material.ts` — banded toon shading.
- `src/gl/post/cartoon-effect.ts` — luma-driven layer composition.
- `src/gl/logo/drag-rotate.ts` — exposes interaction signal for intensity.

Reused as-is: `nodes/halftone.ts`, `nodes/sobel.ts`, `nodes/paper.ts`,
`nodes/blend.ts`, `post/chromatic-aberration.ts`, renderer/ticker/dispose.

## Testing

- Unit tests: spider-sense intensity envelope (attack/decay), floating-sphere
  layout/drift maths, following the existing `*.test.ts` pattern.
- Shaders and final look: manual visual verification against both references.
