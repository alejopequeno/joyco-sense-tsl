// Frame metrics HUD (ported from JOYCO jam's DebugPerfMonitor): stats-gl
// panels for FPS/CPU/GPU plus custom triangle and draw-call counters read off
// `renderer.info`. Mounted on demand from the shared debug pane's "perf HUD"
// toggle, with the live renderer and this app's `Ticker` instance.
//
// stats-gl itself is dynamically imported — same reasoning as the Pane and
// OrbitControls imports in debug-tools.ts: a visitor who never opens
// `?debug` (or never flips the perf toggle) should never download it. jam's
// original statically imports stats-gl at module scope, which — once
// `debug-tools.ts` and this module are pulled into the main bundle — would
// have shipped it to every visitor; that's the one thing this port
// deliberately does NOT carry over.
//
// stats-gl knows the WebGPURenderer natively: `init(renderer)` patches
// `info.reset` to open the CPU sample, and `update()` closes it. Left to
// autoReset, that reset fires in the renderer's *internal* rAF loop — a
// separate callback that runs after our ticker frame — so the sample would
// span the vsync wait between frames and the CPU panel would read the
// display's refresh interval (~8.3ms at 120Hz) instead of actual work. We
// take the frame boundary ourselves: autoReset off, reset at the top of our
// ticker frame, update at the bottom — the sample brackets exactly
// sim → camera → render → DOM. On the WebGL2 fallback backend the GPU panel
// simply stays absent (no timestamp queries), everything else works.
import type { WebGPURenderer } from 'three/webgpu'

import type { Ticker } from '@/gl/ticker'

/**
 * Mount the HUD for an initialized renderer, driven by `ticker`. Returns a
 * dispose so the debug toggle can switch it off and renderer teardown never
 * leaves an overlay or ticker callback behind — including a dispose that
 * races the still-pending `import('stats-gl')` (or the `stats.init()`
 * handshake after it): the `disposed` flag is checked after each async step,
 * so a fast toggle-on/toggle-off never mounts the DOM node or the ticker
 * slots, and `teardownStats` (set as soon as the instance exists, even if
 * construction never finishes appending it) always runs on the way out.
 */
export function mountPerfMonitor(renderer: WebGPURenderer, ticker: Ticker): () => void {
  let disposed = false
  let removeReset: (() => void) | undefined
  let removeTick: (() => void) | undefined
  let teardownStats: (() => void) | undefined

  const setup = import('stats-gl').then(async ({ default: Stats }) => {
    if (disposed) return

    const stats = new Stats({ trackFPS: true, trackHz: true, trackGPU: true })
    // Set immediately (before the async `init()` below) so a dispose that
    // races the handshake still finds an instance to tear down.
    teardownStats = () => {
      stats.dom.remove()
      stats.dispose()
    }

    // init resolves once stats has hooked the renderer (async: it may await
    // the GPU timestamp handshake). Everything DOM/ticker waits for it.
    await stats.init(renderer)
    if (disposed) return

    const dtPanel = stats.addPanel(new Stats.Panel('DT', '#0cf', '#012'))
    const triPanel = stats.addPanel(new Stats.Panel('TRI', '#f80', '#210'))
    const callPanel = stats.addPanel(new Stats.Panel('CALL', '#e08', '#201'))

    stats.dom.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 10000;
      opacity: 0.9;
      display: flex;
      pointer-events: none;
    `
    // stats-gl absolutely positions each panel canvas; relative + auto lets
    // the flex row above lay them out side by side instead of stacked.
    for (const child of Array.from(stats.dom.children) as HTMLElement[]) {
      child.style.position = 'relative'
      child.style.top = 'auto'
      child.style.left = 'auto'
    }
    document.body.appendChild(stats.dom)

    // Session maxima scale the graphs, mirroring jam. DT's max ignores
    // >100ms outliers (tab switches, GC stalls) — one of those would flatten
    // the graph for the rest of the session.
    let maxTri = 0
    let maxCalls = 0
    let maxDt = 0

    // Frame start: reset counters and (via the stats-gl patch) open the CPU
    // sample, before any sim slot runs. See the header — this is what keeps
    // the CPU panel honest under our external render loop.
    renderer.info.autoReset = false
    removeReset = ticker.add(() => renderer.info.reset(), Number.NEGATIVE_INFINITY)

    // Frame end, after every engine slot: `info.render` holds exactly this
    // frame's counts (one reset, one render), and `update()` closes the
    // CPU sample.
    removeTick = ticker.add((dt: number) => {
      // The ticker's dt is seconds; stats-gl and the DT panel both work in
      // ms, mirroring Tempus's deltaTime that jam's original read directly.
      const deltaTimeMs = dt * 1000
      // Raw ms between this rAF and the last — frame *pacing*, where the
      // CPU panel is frame *work*. A missed vsync shows here first.
      if (deltaTimeMs < 100) maxDt = Math.max(maxDt, deltaTimeMs)
      dtPanel.update(deltaTimeMs, maxDt, 1, 'ms')
      dtPanel.updateGraph(deltaTimeMs, maxDt)

      const { triangles, drawCalls } = renderer.info.render
      maxTri = Math.max(maxTri, triangles)
      maxCalls = Math.max(maxCalls, drawCalls)

      triPanel.update(triangles, maxTri, 0)
      triPanel.updateGraph(triangles, maxTri)
      callPanel.update(drawCalls, maxCalls, 0)
      callPanel.updateGraph(drawCalls, maxCalls)

      stats.update()
    }, Number.POSITIVE_INFINITY)
  })

  return () => {
    disposed = true
    removeReset?.()
    removeTick?.()
    // Hand the frame boundary back to the renderer's internal loop.
    renderer.info.autoReset = true
    // Same shape as the canvas host's dispose: never tear down mid-init.
    void setup.finally(() => {
      teardownStats?.()
    })
  }
}
