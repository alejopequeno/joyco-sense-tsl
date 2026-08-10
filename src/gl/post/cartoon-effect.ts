import { screenSize, screenUV, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { blendDarken } from '@/gl/nodes/blend'
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
 */

// Paper grain is sized against a reference height so it does not swim when the
// window resizes.
const PAPER_REFERENCE_HEIGHT = 1000

export class CartoonEffect implements PostEffect {
  /** How far apart the Sobel taps sit — a wider contour line. */
  private readonly contour = uniform(4)
  /** Edge falloff. Low values give a hard ink line. */
  private readonly thickness = uniform(1)
  /** Multiplies the scene colour before the contour is burned in. */
  private readonly boost = uniform(1.1)

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

    const sheet = paper(screenUV.mul(screenSize.y.div(PAPER_REFERENCE_HEIGHT)))

    // Paper multiplies in as the darker of the two, so a white background
    // picks up the grain while the ink stays ink.
    return vec4(blendDarken(sheet, inked, 1), 1)
  }
}
