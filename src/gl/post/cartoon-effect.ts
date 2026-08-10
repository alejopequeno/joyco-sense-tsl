import {
  luminance,
  mix,
  screenSize,
  screenUV,
  smoothstep,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { Color } from 'three/webgpu'
import type { Node } from 'three/webgpu'

import { blendDarken, blendScreen } from '@/gl/nodes/blend'
import { halftoneDots, lines, rotateUv } from '@/gl/nodes/halftone'
import { paper } from '@/gl/nodes/paper'
import { sobel } from '@/gl/nodes/sobel'
import type { PostEffect, ScenePass } from '@/gl/post/post-effect'

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

// Paper grain is sized against a reference height so it does not swim when the
// window resizes.
const PAPER_REFERENCE_HEIGHT = 1000

// The sketch's ink is `new Color(64, 43, 43)` divided by 255 in the shader —
// three would read those as linear values well past white, hence the manual
// scale. A dark warm brown, not black.
const INK_COLOR = new Color(64 / 255, 43 / 255, 43 / 255)

// How far the ink pulls each screened pixel. The original hardcodes 0.5.
const INK_STRENGTH = 0.5

export class CartoonEffect implements PostEffect {
  /** How far apart the Sobel taps sit — a wider contour line. */
  private readonly contour = uniform(4)
  /** Edge falloff, and stroke width for the screening layers. */
  private readonly thickness = uniform(1)
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

  build(scenePass: ScenePass): Node<'vec4'> {
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

    const tone = luminance(inked)
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

    const sheet = paper(screenUV.mul(screenSize.y.div(PAPER_REFERENCE_HEIGHT)))

    // Paper multiplies in as the darker of the two, so a light background
    // picks up the grain while the ink stays ink.
    return vec4(blendDarken(sheet, screened, 1), 1)
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
