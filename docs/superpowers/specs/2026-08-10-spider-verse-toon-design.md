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

## Iteration 2 (same day): overlay redesign + tap-to-pose

Visual review against the running scene showed the first overlay reading as
multicoloured bunting, not spider-sense. Comic canon (Ditko) and the film
references define the language: short hand-drawn wavy strokes radiating
around the subject, plus thin red needles flashing in from the frame edges.

Changes to the spider-sense overlay (`src/gl/post/spider-sense.ts` rewrite):

- **Radial squiggles replace the full-width horizontal lines.** Eight short
  tapered wavy strokes arranged on a ring around screen centre
  (aspect-corrected radius 0.25–0.4), oriented tangentially, varied lengths
  and wave frequencies. Mostly cream, two red, one blue. Position/phase
  jitter re-randomized per 12 Hz flicker step; occasional per-stroke dropout.
- **Thin needles replace the sawtooth edge spikes.** Narrow-based long
  spikes, sparse and irregular (roughly 45% of columns active per flicker
  step), hot red only, longest near the frame corners, stronger along the
  top edge than the bottom.

New interaction (tap-to-pose):

- A tap (pointer up with under ~6 px of travel) tweens the logo to a fixed
  presentation pose (`POSE_YAW`/`POSE_PITCH`, tuned by eye to the reference
  screenshot) with a frame-rate-independent exponential approach that takes
  the shortest angular path. The spider-sense overlay burns at full
  intensity for the pose hold (~1.6 s), then decays as usual and the idle
  spin resumes from the pose.
- Dragging is unchanged (free rotation + inertia); starting a drag cancels
  an in-flight pose.

## Iteration 3 (same day): silhouette language + still logo

Further reference review (Ditko-style fan art, Spider-Verse video edits, a
film still of the sense burst) refined the overlay language and the motion:

- **Radial squiggles point outward.** The strokes' local frame rotates 90°:
  the wave now runs along the radial axis (flame-like, radiating from the
  logo), not tangentially around the ring.
- **Silhouette contour.** A cream offset outline traces the actual
  silhouette of the logo and spheres, like the fan art's body contour
  strokes. Implementation: an object-vs-backdrop mask rides the scene
  pass MRT (`mask` channel — backdrop overrides it to 0 via
  `material.mrtNode`), and the overlay dilates it at two radii with
  angular taps; the difference is a band at a fixed offset from the
  silhouette, wobbled by a low-frequency angular sine so it reads
  hand-drawn. Gated by intensity like everything else.
- **Needles converge on screen centre.** The edge needles become polar
  rays: thin triangles in angle around screen centre, clipped to the
  top/bottom edge zones — every needle visibly points at the centre, as
  in the film still.
- **The logo no longer idles.** Idle spin is removed; the logo moves only
  when touched (drag or tap-to-pose). The spheres keep drifting on their
  own.
- The comic caption box idea was considered and dropped.
- `post-hope` (posterization) noted as a possible future direction, out of
  scope here.

## Iteration 4 (2026-08-11): back to smooth shading, idle spin returns

Live testing exposed the banded toon material's failure mode on this
geometry: the logo's large flat faces share one normal, so the cel bands and
the clipped specular flip the entire face dark/light/white in a single frame
as it rotates. The reference sketch never bands — its comic feel comes from
the post screening over smooth standard lighting.

- **Material reverts to the faithful port**: `MeshStandardNodeMaterial`
  (roughness 0.2, metalness 0.1) with the noise-driven `colorSpline` albedo,
  as first shipped — smooth transitions, no bands, no clipped specular. The
  red key / blue rim / dim ambient scene lights return with it.
- **Idle spin returns** (reverting Iteration 3's "still logo"): slow yaw
  when at rest, exactly the original behavior.
- **Outlines softened**: the Sobel contour reads too heavy against the
  sketch — contour tap distance 4 → 2.5, thickness 1 → 0.8.
