/**
 * The engine's one debug pane — a single shared Tweakpane every feature and
 * the canvas host append folders to, instead of each spinning up its own.
 * Ported from JOYCO jam's `gl/debug-tools.ts` to this vanilla-three engine:
 * same idea (one pane, default scene tooling, explore the scene through a
 * clone of the live camera).
 *
 * Gated to `?debug` in the URL — the URL is the single source of truth. OPT+D
 * (Option/Alt-D) toggles that param and shows/hides the pane live, no reload.
 * While hidden, folders still register (into a set) but nothing loads: Tweakpane
 * and OrbitControls are dynamically imported only once the pane is shown, so
 * neither enters the player runtime. The pane lives in a `data-ui` host so a
 * pointer-surface convention elsewhere in the app can ignore clicks on it.
 *
 * Consumers:
 *   - The canvas host calls `debug.attachScene(...)` once the renderer is
 *     live — it builds the "scene" folder (camera monitor, grid, explore,
 *     perf) and caches the scene's `Ticker` for `bind()`'s live sliders.
 *   - A feature registers its own knobs with `debug.folder("title", (f) => {...})`
 *     and disposes the returned handle on unmount.
 */
import type { FolderApi } from '@tweakpane/core'
import type { Pane } from 'tweakpane'
import { Camera, GridHelper, OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
import { PRIORITY, type Ticker } from '@/gl/ticker'

import { addCopyButton, bindSchema, schemaValues, toFolders, type Debuggable, type DebugSchema } from './schema'
import { mountPerfMonitor } from './perf-monitor'

export { addCopyButton } from './schema'

/** A folder builder; may return a cleanup run when the folder is disposed. */
type FolderBuild = (folder: FolderApi) => void | (() => void)

/** What the scene tooling needs to drive the live scene. */
export type SceneContext = {
  scene: Scene
  camera: Camera
  /** The controls surface OrbitControls binds to. */
  canvas: HTMLElement
  renderer: WebGPURenderer
  /** This app's ticker — jam's engine carried a global Tempus instance instead;
   * here every per-frame debug hook (camera monitor, explore sync, perf HUD)
   * registers on the instance the scene itself runs on. */
  ticker: Ticker
  /** Swap the camera the render pipeline draws through; `null` restores the game
   * camera. Explore-orbit uses this to render a throwaway clone so the game's rig
   * can keep posing its own camera without fighting the debug controls. */
  setRenderCamera: (camera: Camera | null) => void
}

/** This repo's `PRIORITY` only names `UPDATE` and `RENDER` (jam had a finer
 * `INPUT`/`GAME`/`CAMERA`/`RENDER`/`DOM` ladder). Read-only DOM refreshes
 * (camera monitor, live schema sliders) just need to run after the frame's
 * render call, which `Ticker.add` accepts as any number — no need to widen
 * the shared enum for one tier. */
const AFTER_RENDER = PRIORITY.RENDER + 1

/** Copy the projection fields a resize changes (ortho frustum extents / camera
 * aspect) from `src` to `dst`, leaving pose and zoom alone — OrbitControls owns
 * those on the explore clone. Uses the `is*` flags, not `instanceof`, so it holds
 * even if a camera instance crossed a package boundary. Keeps a clone framed as
 * the window resizes without any resize plumbing. */
function syncFrustum(src: Camera, dst: Camera): void {
  if ((src as OrthographicCamera).isOrthographicCamera && (dst as OrthographicCamera).isOrthographicCamera) {
    const s = src as OrthographicCamera
    const d = dst as OrthographicCamera
    d.left = s.left
    d.right = s.right
    d.top = s.top
    d.bottom = s.bottom
    d.near = s.near
    d.far = s.far
    d.updateProjectionMatrix()
  } else if ((src as PerspectiveCamera).isPerspectiveCamera && (dst as PerspectiveCamera).isPerspectiveCamera) {
    const s = src as PerspectiveCamera
    const d = dst as PerspectiveCamera
    d.aspect = s.aspect
    d.fov = s.fov
    d.near = s.near
    d.far = s.far
    d.updateProjectionMatrix()
  }
}

/** A registered folder — its builder is kept so it can be (re)built whenever the
 * pane is shown, and re-torn-down when it's hidden or the owner unmounts. */
type Registration = {
  title: string
  build: FolderBuild
  /** Start the folder collapsed (defaults to Tweakpane's expanded default). */
  expanded?: boolean
  disposer?: Disposer
}

/** Rewrite the current URL's `debug` flag, keeping it a bare `?debug` (not
 * `?debug=`) so it reads the way people type it. */
function urlWithDebug(on: boolean): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('debug')
  if (on) url.searchParams.append('debug', '')
  const qs = url.searchParams.toString().replace(/(^|&)debug=(&|$)/g, '$1debug$2')
  url.search = qs ? `?${qs}` : ''
  return url.toString()
}

class DebugTools {
  /** Whether the pane is currently shown — mirrors `?debug` in the URL, the
   * single source of truth. Flipped by OPT+D or a URL change. */
  private active = false
  private paneP: Promise<Pane | null> | null = null
  private pane_: Pane | null = null
  private host: HTMLElement | null = null
  private readonly registrations = new Set<Registration>()
  /** Cached from the first `attachScene()` call — `bind()`'s live sliders need
   * a ticker to poll on, but (unlike jam's global Tempus) this engine's ticker
   * only exists once a scene hands one over. Folders registered before any
   * scene has attached simply get inert `live` sliders until then. */
  private ticker: Ticker | null = null

  constructor() {
    if (typeof window === 'undefined') return
    this.active = new URLSearchParams(window.location.search).has('debug')
    // OPT+D toggles the URL flag (source of truth) and the pane with it. `e.code`
    // so the Mac Option-glyph on the key ("∂") doesn't matter; preventDefault so
    // it can't trip a browser default (address-bar focus on some platforms).
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyD' || !e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      this.setActive(!this.active)
    })
    // Keep in step with the URL if it changes by other means (back/forward).
    window.addEventListener('popstate', () => {
      this.apply(new URLSearchParams(window.location.search).has('debug'))
    })
  }

  /** True while `?debug` is set — the pane is (or is becoming) visible. */
  get enabled(): boolean {
    return this.active
  }

  /** User toggle: write the URL flag, then show/hide. */
  private setActive(on: boolean): void {
    if (on === this.active) return
    history.replaceState(history.state, '', urlWithDebug(on))
    this.apply(on)
  }

  /** Show or hide the pane to match `on` (no URL write — callers own that). */
  private apply(on: boolean): void {
    if (on === this.active) return
    this.active = on
    if (on) for (const reg of this.registrations) this.mountFolder(reg)
    else this.teardown()
  }

  /** The shared pane, built lazily the first time it's shown. Hosted in a
   * `data-ui` container fixed top-right, scrollable for many folders. */
  private pane(): Promise<Pane | null> {
    if (!this.active) return Promise.resolve(null)
    if (!this.paneP) {
      this.paneP = import('tweakpane').then(({ Pane }) => {
        if (!this.active) return null // toggled back off during the import
        const host = document.createElement('div')
        host.dataset.ui = ''
        host.style.cssText =
          'position:fixed;top:12px;right:12px;z-index:10000;width:280px;' + 'max-height:calc(100dvh - 24px);overflow-y:auto;'
        document.body.appendChild(host)
        this.host = host
        this.pane_ = new Pane({ container: host, title: 'debug' })
        return this.pane_
      })
    }
    return this.paneP
  }

  private mountFolder(reg: Registration): void {
    void this.pane().then((pane) => {
      // Bail if hidden, unregistered, or already built while we awaited.
      if (!pane || !this.active || !this.registrations.has(reg) || reg.disposer) {
        return
      }
      const disposer = new Disposer()
      reg.disposer = disposer
      const folder = pane.addFolder({
        title: reg.title,
        ...(reg.expanded !== undefined ? { expanded: reg.expanded } : {}),
      })
      disposer.add(() => folder.dispose())
      const cleanup = reg.build(folder)
      if (cleanup) disposer.add(cleanup)
    })
  }

  private unmountFolder(reg: Registration): void {
    reg.disposer?.dispose()
    // `delete` (not `= undefined`) so the optional field stays a plain
    // `Disposer | (absent)` under `exactOptionalPropertyTypes` — assigning
    // `undefined` to it would require widening the type to include it.
    delete reg.disposer
  }

  /** Tear down every folder and the pane itself, but KEEP the registrations —
   * re-showing (OPT+D again) rebuilds them from the same builders. */
  private teardown(): void {
    for (const reg of this.registrations) this.unmountFolder(reg)
    this.pane_?.dispose()
    this.pane_ = null
    this.host?.remove()
    this.host = null
    this.paneP = null
  }

  /**
   * Register a folder of controls. Its `build` runs whenever the pane is shown
   * (now if it already is, else on the next OPT+D) and may return a cleanup. The
   * returned handle unregisters the folder and runs that cleanup — call it on
   * unmount. Registering while hidden loads nothing. Pass `expanded: false` to
   * start the folder collapsed.
   */
  folder(title: string, build: FolderBuild, opts?: { expanded?: boolean }): () => void {
    const reg: Registration = { title, build, ...opts }
    this.registrations.add(reg)
    if (this.active) this.mountFolder(reg)
    return () => {
      this.registrations.delete(reg)
      this.unmountFolder(reg)
    }
  }

  /** Default scene tooling for the live renderer/camera (the canvas host owns
   * this) — one "scene" folder composed of the tools below, each self-contained
   * and returning its own cleanup. Also caches `ctx.ticker` for `bind()`'s live
   * sliders (see the field doc). */
  attachScene(ctx: SceneContext): () => void {
    this.ticker = ctx.ticker
    const perfState = { perf: false }
    let removePerf: (() => void) | undefined
    const setPerf = (on: boolean) => {
      if (on && !removePerf) removePerf = mountPerfMonitor(ctx.renderer, ctx.ticker)
      else if (!on) {
        removePerf?.()
        removePerf = undefined
      }
    }
    const removeFolder = this.folder(
      'scene',
      (folder) => {
        // Collapsed by default — engine tooling, not the game's own knobs.
        const disposer = new Disposer()
        disposer.add(this.sceneCameraMonitor(folder, ctx.camera, ctx.ticker))
        disposer.add(this.sceneGrid(folder, ctx.scene))
        disposer.add(this.sceneEnvBackground(folder, ctx.scene))
        disposer.add(this.sceneExplore(folder, ctx.camera, ctx.canvas, ctx.setRenderCamera, ctx.ticker))
        folder.addBinding(perfState, 'perf', { label: 'perf HUD' }).on('change', (ev) => setPerf(ev.value))
        return disposer.dispose
      },
      { expanded: false },
    )
    return () => {
      removeFolder()
      removePerf?.()
    }
  }

  /** Live read-only camera position + zoom, refreshed each frame. */
  private sceneCameraMonitor(folder: FolderApi, camera: Camera, ticker: Ticker): () => void {
    const cam = { position: '', zoom: 1 }
    folder.addBinding(cam, 'position', { readonly: true })
    folder.addBinding(cam, 'zoom', {
      readonly: true,
      format: (v: number) => v.toFixed(2),
    })
    return ticker.add(() => {
      const p = camera.position
      cam.position = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`
      cam.zoom = (camera as OrthographicCamera).zoom ?? 1
      folder.refresh()
    }, AFTER_RENDER)
  }

  /** A toggleable 20×20 grid helper on the scene floor. */
  private sceneGrid(folder: FolderApi, scene: Scene): () => void {
    const disposer = new Disposer()
    const state = { grid: false }
    folder.addBinding(state, 'grid').on('change', (ev) => {
      if (ev.value) {
        const grid = new GridHelper(20, 20)
        scene.add(grid)
        disposer.add(() => {
          scene.remove(grid)
          grid.dispose()
        })
      } else disposer.dispose()
    })
    return disposer.dispose
  }

  /** Show the scene's environment map as the backdrop — the lighting that
   * reflective/transmissive materials sample. No-op if the scene has none. */
  private sceneEnvBackground(folder: FolderApi, scene: Scene): () => void {
    const savedBg = scene.background
    const state = { envBg: false }
    folder.addBinding(state, 'envBg', { label: 'env as bg' }).on('change', (ev) => {
      scene.background = ev.value && scene.environment ? scene.environment : savedBg
    })
    return () => {
      scene.background = savedBg
    }
  }

  /** Explore the scene with OrbitControls without the game's camera rig fighting
   * for control. Rather than grabbing the live camera (which a rig re-poses every
   * frame), we clone it and tell the pipeline to render through the clone: the
   * game keeps driving its own camera, invisibly, and disabling just points the
   * pipeline back at it — no pose to save or restore. The clone's frustum is
   * re-synced from the game camera each frame so a window resize keeps it framed.
   * OrbitControls loads on demand to stay out of the player runtime. */
  private sceneExplore(
    folder: FolderApi,
    camera: Camera,
    canvas: HTMLElement,
    setRenderCamera: (camera: Camera | null) => void,
    ticker: Ticker,
  ): () => void {
    let active: Disposer | null = null
    const stop = () => {
      const stale = active
      active = null
      stale?.dispose()
    }
    const state = { explore: false }
    folder.addBinding(state, 'explore', { label: 'explore (orbit)' }).on('change', (ev) => {
      if (!ev.value) return stop()
      const session = new Disposer()
      active = session
      // Registered before the async work so teardown is complete even while
      // OrbitControls is still loading.
      session.add(() => setRenderCamera(null))
      void import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
        if (active !== session) return // superseded or torn down while loading
        // A throwaway copy — same subclass and projection — that orbit owns.
        // The game never sees it, so its rig can't stomp the pose we set.
        const clone = camera.clone()
        const orbit = new OrbitControls(clone as OrthographicCamera, canvas)
        session.add(() => orbit.dispose())
        orbit.enableDamping = true
        // The game camera can advertise its look target; else orbit origin.
        const target = camera.userData.target as Vector3 | undefined
        if (target) orbit.target.copy(target)
        orbit.update()
        setRenderCamera(clone)
        // Before RENDER: keep the clone's frustum in step with the game
        // camera the rig resizes, then let orbit apply this frame's input.
        const removeTick = ticker.add(() => {
          syncFrustum(camera, clone)
          orbit.update()
        }, PRIORITY.UPDATE)
        session.add(removeTick)
      })
    })
    return stop
  }

  /**
   * Register a folder from a schema THUNK — the declarative counterpart to
   * {@link folder}. The knobs bind themselves via {@link bindSchema}; `copy` adds
   * a "copy values" button that serializes the schema's live values (the thunk is
   * re-read on click, so it snapshots current state); `extend` adds anything a
   * flat schema can't express (buttons, a dropdown with side effects) and may
   * return its own cleanup.
   */
  bind(
    title: string,
    getSchema: () => DebugSchema,
    opts?: {
      expanded?: boolean
      copy?: boolean
      onRebuild?: () => void
      extend?: (folder: FolderApi) => void | (() => void)
    },
  ): () => void {
    return this.folder(
      title,
      (folder) => {
        const disposer = new Disposer()
        const ticker = this.ticker
        disposer.add(
          bindSchema(
            folder,
            getSchema(),
            opts?.onRebuild,
            // Frame registrar for `live` sliders — after render, mirroring the
            // camera monitor's per-frame refresh. `null` until a scene has
            // attached, in which case `live` sliders stay inert (see the
            // `ticker` field doc).
            ticker ? (fn) => ticker.add(fn, AFTER_RENDER) : undefined,
          ),
        )
        const cleanup = opts?.extend?.(folder)
        if (cleanup) disposer.add(cleanup)
        if (opts?.copy) addCopyButton(folder, () => schemaValues(getSchema()))
        return disposer.dispose
      },
      // Extracted (not `{ expanded: opts?.expanded }`) so an absent `opts`
      // stays absent rather than an explicit `expanded: undefined`.
      opts?.expanded !== undefined ? { expanded: opts.expanded } : {},
    )
  }

  /**
   * Mount every folder a {@link Debuggable} owns and return one disposer for the
   * lot. A class exposes its whole debug surface — titles, copy buttons, extends
   * — as `debug()`, so a game boundary registers it in a single call instead of
   * one {@link bind} per folder.
   */
  register(source: Debuggable): () => void {
    const disposer = new Disposer()
    for (const folder of toFolders(source.debug())) {
      // Destructuring (not `{ expanded: folder.expanded, ... }`) so the rest
      // object's optional keys stay optional instead of explicit-undefined.
      const { title, schema, ...opts } = folder
      disposer.add(this.bind(title, schema, opts))
    }
    return disposer.dispose
  }
}

export const debug = new DebugTools()
