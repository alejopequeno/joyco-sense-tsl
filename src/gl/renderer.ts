import { float, mrt, normalView, output, pass } from 'three/tsl'
import { NoToneMapping, RenderPipeline, SRGBColorSpace, WebGPURenderer } from 'three/webgpu'
import type { Camera, Scene } from 'three/webgpu'

import type { SceneContext } from '@/gl/debug/debug-tools'
import { Disposer } from '@/gl/dispose'
import type { PostEffect } from '@/gl/post/post-effect'
import { PRIORITY, type Ticker } from '@/gl/ticker'

export type RendererOptions = {
  canvas: HTMLCanvasElement
  scene: Scene
  camera: Camera
  ticker: Ticker
  /**
   * Fired with the CSS-pixel size once the backend is ready and on every
   * resize. Cameras own their own frustum, so the renderer only reports — it
   * never touches projection.
   */
  onResize?: (width: number, height: number) => void
  /**
   * Optional screen-space effect. With none, the scene renders straight to the
   * canvas; with one, it renders through a `RenderPipeline` whose output node
   * the effect builds.
   */
  post?: PostEffect
  /**
   * The shared debug pane singleton. When present, the scene tooling folder
   * (camera monitor, grid, explore-orbit, perf HUD) attaches once the
   * pipeline is built. Optional so headless/test callers can skip it.
   */
  debug?: { attachScene(ctx: SceneContext): () => void }
}

/**
 * Binds a WebGPU (or WebGL2 fallback) backend to one canvas, owns sizing and
 * DPR, and drives the render slot on the shared ticker. Knows nothing about
 * what is in the scene.
 */
export class Renderer {
  private readonly renderer: WebGPURenderer
  private readonly canvas: HTMLCanvasElement
  private readonly onResize: ((width: number, height: number) => void) | undefined
  private readonly disposer = new Disposer()

  private disposed = false
  private ready = false

  constructor({ canvas, scene, camera, ticker, onResize, post, debug }: RendererOptions) {
    this.canvas = canvas
    this.onResize = onResize

    const renderer = new WebGPURenderer({ canvas, antialias: true })
    // Explicit even where it matches the default: shader math runs in linear
    // space and the output re-encodes to sRGB.
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = NoToneMapping
    this.renderer = renderer

    const handleResize = (): void => this.setSize()
    window.addEventListener('resize', handleResize)
    this.disposer.add(() => window.removeEventListener('resize', handleResize))

    // WebGPU acquires its device asynchronously, falling back to WebGL2 where
    // it is missing. Nothing sizes or renders before that settles.
    const init = renderer
      .init()
      .then(() => {
        if (this.disposed) return
        this.ready = true
        this.setSize()
        // Log the NEGOTIATED backend, not the requested one — three falls back
        // silently.
        const isWebGPU =
          (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
        console.info(`[gl] backend: ${isWebGPU ? 'webgpu' : 'webgl2'}`)

        // Debug's explore-orbit renders through a throwaway camera clone
        // instead of the game camera. With a post pipeline, the scene pass
        // node's own `camera` field is reassigned directly — it is read
        // fresh every render (verified against `PassNode`'s `updateBefore`,
        // which reads `this.camera` per call). Without a pipeline there is
        // no pass node to redirect, so a mutable holder stands in for it.
        let renderCamera = camera
        const { draw, setCamera } = post
          ? this.buildPipeline(post, scene, camera)
          : { draw: () => renderer.render(scene, renderCamera), setCamera: null }
        const removeRender = ticker.add(draw, PRIORITY.RENDER)
        this.disposer.add(removeRender)

        if (debug) {
          const setRenderCamera = (cam: Camera | null): void => {
            renderCamera = cam ?? camera
            setCamera?.(renderCamera)
          }
          const removeDebug = debug.attachScene({
            scene,
            camera,
            canvas: this.canvas,
            renderer,
            ticker,
            setRenderCamera,
          })
          this.disposer.add(removeDebug)
        }
      })
      .catch((error: unknown) => {
        console.error('[gl] renderer init failed', error)
      })

    // Registered up front so a dispose() racing the handshake still runs, but
    // gated on init settling — tearing down a mid-handshake backend is
    // undefined territory.
    this.disposer.add(() => {
      void init.finally(() => renderer.dispose())
    })
  }

  /**
   * Wires the scene pass, its MRT, and the effect's graph into a
   * `RenderPipeline`, and returns the per-frame draw call plus a setter that
   * redirects the pass's own camera — what `setRenderCamera` calls into so
   * debug's explore-orbit can render through a clone.
   */
  private buildPipeline(
    post: PostEffect,
    scene: Scene,
    camera: Camera,
  ): { draw: () => void; setCamera: (cam: Camera) => void } {
    const scenePass = pass(scene, camera)
    // The extra buffer the contour pass reads. Asking for it here is what
    // saves the second scene render the original sketch needed.
    scenePass.setMRT(mrt({ output, normal: normalView, mask: float(1) }))

    const pipeline = new RenderPipeline(this.renderer, post.build(scenePass))
    this.disposer.add(() => {
      post.dispose?.()
      pipeline.dispose()
    })
    return {
      draw: () => pipeline.render(),
      setCamera: (cam) => {
        scenePass.camera = cam
      },
    }
  }

  private setSize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!this.ready || width === 0 || height === 0) return
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // CSS keeps owning the element's size; only the drawing buffer is set here.
    this.renderer.setSize(width, height, false)
    this.onResize?.(width, height)
  }

  dispose(): void {
    // The flag stops the init continuation from registering a render slot on a
    // dead instance; the disposer unwinds everything else.
    this.disposed = true
    this.disposer.dispose()
  }
}
