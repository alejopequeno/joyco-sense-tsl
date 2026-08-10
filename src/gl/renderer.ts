import { NoToneMapping, SRGBColorSpace, WebGPURenderer } from 'three/webgpu'
import type { Camera, Scene } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
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

  constructor({ canvas, scene, camera, ticker, onResize }: RendererOptions) {
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
        const removeRender = ticker.add(() => {
          renderer.render(scene, camera)
        }, PRIORITY.RENDER)
        this.disposer.add(removeRender)
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
