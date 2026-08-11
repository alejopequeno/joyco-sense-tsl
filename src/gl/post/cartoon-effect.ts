import {
  float,
  luminance,
  mix,
  rtt,
  screenSize,
  screenUV,
  smoothstep,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

import { INK_COLOR } from '@/gl/palette'
import { blendDarken, blendScreen } from '@/gl/nodes/blend'
import { halftoneDots, lines, rotateUv } from '@/gl/nodes/halftone'
import { printGrain } from '@/gl/nodes/paper'
import { sobel } from '@/gl/nodes/sobel'
import { chromaticAberration } from '@/gl/post/chromatic-aberration'
import type { PostEffect, ScenePass } from '@/gl/post/post-effect'
import { spiderSense } from '@/gl/post/spider-sense'

/**
 * Ported from spite/sketch (MIT) — `post-cartoon-iii/post.js`, "Post Cartoon
 * III — Spider-Verse".
 *
 * The original renders the scene twice, the second time with
 * `scene.overrideMaterial = MeshNormalMaterial`, to get a normal buffer to run
 * Sobel over. Here the normals ride along on the pass's MRT, so the scene is
 * only drawn once.
 *
 * The original also gates each screening layer behind an `if`. These are plain
 * masks instead — the branches only ever selected between "apply" and "leave
 * alone", which a `mix` against a `step` expresses without divergence.
 */

// Grain is sized against a reference height so it does not swim when the
// window resizes.
const GRAIN_REFERENCE_HEIGHT = 1000

// How far the ink pulls each screened pixel. The original hardcodes 0.5.
const INK_STRENGTH = 0.5

// The sketch's `luma()` is Rec. 601. TSL's `luminance()` defaults to Rec. 709,
// which reads greens brighter and would shift every screening threshold.
const REC_601 = vec3(0.299, 0.587, 0.114)

// The sketch blends a Parchment scan over the frame with blendDarken: the
// brightest areas cap to warm paper instead of clipping to white. This is
// that sheet, procedurally — the grain modulates it.
const PAPER_SHEET = vec3(0.93, 0.88, 0.78)

export class CartoonEffect implements PostEffect {
  /** How far apart the Sobel taps sit — a wider contour line. */
  private readonly contour = uniform(2.5)
  /** Edge falloff, and stroke width for the screening layers. */
  private readonly thickness = uniform(0.8)
  /** Multiplies the scene colour before the contour is burned in. */
  private readonly boost = uniform(1.1)
  /** Screening frequency. Higher packs the lines and dots tighter. */
  private readonly scale = uniform(1.5)
  private readonly inkColor = uniform(INK_COLOR)

  // Luma cut-offs for the three screening layers. `mid` and `light` share a
  // value in the original, so mid tones get hatched and screened at once —
  // that overlap is what stops the transition from banding.
  private readonly dark = uniform(0.86)
  private readonly mid = uniform(0.62)
  private readonly light = uniform(0.62)

  /** RGB split at the frame edge, in pixels. */
  private readonly aberration = uniform(100)

  /** Spider-sense overlay strength, 0..1. Fed per frame from the envelope. */
  private readonly senseIntensity = uniform(0)
  /** Extra RGB split at full spider-sense, in pixels, on top of `aberration`. */
  private readonly senseAberrationBoost = uniform(150)

  /** Drives the overlay and the aberration boost. Clamped to 0..1. */
  setSenseIntensity(value: number): void {
    this.senseIntensity.value = Math.min(Math.max(value, 0), 1)
  }

  build(scenePass: ScenePass): Node<'vec4'> {
    // The aberration has to sample its input at shifted coordinates, and you
    // cannot sample a computed graph — so the composite is rendered to a
    // texture first. `rtt` with no size tracks the viewport on its own. This is
    // the sketch's second FBO, minus the manual plumbing.
    const composite = rtt(this.buildComposite(scenePass))
    const delta = this.aberration.add(this.senseIntensity.mul(this.senseAberrationBoost))
    return chromaticAberration(composite, delta)
  }

  private buildComposite(scenePass: ScenePass): Node<'vec4'> {
    const color = scenePass.getTextureNode('output')
    const normal = scenePass.getTextureNode('normal')

    const texelSize = screenSize.reciprocal()

    // Sobel returns edge magnitude, so invert it: 1 on flat surfaces, 0 on a
    // silhouette. The original then remaps around 0.5 with `thickness` as the
    // half-width, which is what turns a soft gradient into an ink line.
    const edge = sobel(normal, screenUV, texelSize, this.contour).length().oneMinus()
    const contourMask = smoothstep(
      this.thickness.mul(-1).add(0.5),
      this.thickness.add(0.5),
      edge
    )

    // Darken toward black wherever the mask says "edge". `0.5 - mask` goes
    // negative on flat areas, which clamps the blend to a no-op there.
    const inked = blendDarken(
      color.rgb.mul(this.boost),
      vec3(0),
      contourMask.mul(-1).add(0.5)
    )

    const tone = luminance(inked, REC_601)
    const screenUvScaled = screenUV.mul(this.scale)

    // Darkest tones: hatching at 45 degrees.
    const darkHatch = lines(
      tone.div(this.dark),
      rotateUv(screenUvScaled, 45),
      screenSize,
      this.thickness
    )
    const afterDark = this.applyInk(inked, darkHatch, step(tone, this.dark))

    // Mid tones: a second pass at 15 degrees, crossing the first.
    const midHatch = lines(
      tone.div(this.mid),
      rotateUv(screenUvScaled, 15),
      screenSize,
      this.thickness
    )
    const afterMid = this.applyInk(afterDark, midHatch, step(tone, this.mid))

    // Brightest tones: halftone dots screened toward white.
    const dots = halftoneDots(
      tone,
      screenUV.mul(screenSize),
      this.light,
      this.scale,
      this.thickness
    )
    const screened = mix(
      afterMid,
      blendScreen(afterMid, vec3(1), dots),
      step(this.light, tone)
    )

    const grain = printGrain(screenUV.mul(screenSize.y.div(GRAIN_REFERENCE_HEIGHT)))

    const papered = blendDarken(screened, PAPER_SHEET.mul(grain), float(1))

    return vec4(
      spiderSense(papered, scenePass.getTextureNode('mask'), this.senseIntensity),
      1
    )
  }

  /**
   * Pulls `base` toward the ink colour wherever the screening pattern is off
   * (`pattern` near 0) and the tone gate is open.
   */
  private applyInk(
    base: Node<'vec3'>,
    pattern: Node<'float'>,
    gate: Node<'float'>
  ): Node<'vec3'> {
    return mix(base, mix(base, this.inkColor, INK_STRENGTH), pattern.oneMinus().mul(gate))
  }
}
