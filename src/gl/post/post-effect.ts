import type { Node, PassNode } from 'three/webgpu'

/**
 * The scene render, exposed as a node. `Renderer` builds it, attaches the MRT
 * that carries the extra buffers, and hands it over.
 */
export type ScenePass = PassNode

/**
 * An effect turns the scene pass into the final screen colour. One `build` call
 * at setup time — the graph it returns is compiled once, so anything that has
 * to change per frame belongs in a `uniform()` the effect owns, never in a
 * rebuild.
 */
export interface PostEffect {
  build(scenePass: ScenePass): Node<'vec4'>
  dispose?(): void
}
