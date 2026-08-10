import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene } from 'three/webgpu'

import { createBackdrop } from '@/gl/backdrop'
import { DragRotate } from '@/gl/logo/drag-rotate'
import { createLogoMesh } from '@/gl/logo/logo-mesh'
import { CartoonEffect } from '@/gl/post/cartoon-effect'
import { Renderer } from '@/gl/renderer'
import { Ticker } from '@/gl/ticker'
import '@/style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')
if (!canvas) throw new Error('#gl canvas not found')

const scene = new Scene()
// Only ever seen where the backdrop does not reach.
scene.background = new Color(0x0a0a18)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(0, 0, 3.2)

// Two saturated keys from opposite sides, the way the film lights Miles: a red
// wash from screen right and a blue rim from screen left, with almost no fill
// so the middle stays dark and the colours never wash into each other. Kept
// dim overall because the contour blend extrapolates flat areas to 1.5x and
// `boost` adds another 1.1x on top.
const redKey = new DirectionalLight(0xff1a3c, 1.6)
redKey.position.set(3, 2, 3)
const blueRim = new DirectionalLight(0x2a4cff, 1.6)
blueRim.position.set(-3, -1, 1)
const fillLight = new AmbientLight(0x2a2a55, 0.25)
scene.add(redKey, blueRim, fillLight)

scene.add(createBackdrop())

const logo = createLogoMesh()
scene.add(logo)

const ticker = new Ticker()

new DragRotate(logo, canvas, ticker)

new Renderer({
  canvas,
  scene,
  camera,
  ticker,
  post: new CartoonEffect(),
  onResize: (width, height) => {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  },
})

ticker.start()
