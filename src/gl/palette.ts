import { vec3 } from 'three/tsl'
import { Color } from 'three/webgpu'
import type { Node } from 'three/webgpu'

/**
 * The Spider-Verse palette, sampled from the Miles Morales spider-sense still:
 * a deep ultramarine and a hot red carrying the duotone, magenta on the seams,
 * cream where the printing lets the page through. Shared by the backdrop, the
 * toon material and the post chain so the scene stays one print job.
 */

export const SPIDER_BLUE: Node<'vec3'> = vec3(43 / 255, 55 / 255, 132 / 255)
export const SPIDER_RED: Node<'vec3'> = vec3(223 / 255, 31 / 255, 45 / 255)
export const SPIDER_MAGENTA: Node<'vec3'> = vec3(255 / 255, 25 / 255, 115 / 255)
/** Hotter than SPIDER_RED — the spider-sense overlay has to read over it. */
export const SENSE_RED: Node<'vec3'> = vec3(1.0, 0.16, 0.13)
export const CREAM: Node<'vec3'> = vec3(0.96, 0.93, 0.86)

/** Ink for the screening layers: near-black violet, not the sketch's warm
 * brown — brown mud-ifies a blue/red duotone. */
export const INK_COLOR = new Color(0.1, 0.06, 0.16)
