import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene } from 'three/webgpu'

import { DragRotate } from '@/gl/logo/drag-rotate'
import { createLogoMesh } from '@/gl/logo/logo-mesh'
import { CartoonEffect } from '@/gl/post/cartoon-effect'
import { Renderer } from '@/gl/renderer'
import { Ticker } from '@/gl/ticker'
import '@/style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')
if (!canvas) throw new Error('#gl canvas not found')

const scene = new Scene()
// Near-white, because the paper blends in with `min` per channel — over a dark
// background it would contribute nothing and the frame would read as a void.
scene.background = new Color(0xe8e4da)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(0, 0, 3.2)

// Deliberately dim. The contour blend extrapolates flat areas to 1.5x and
// `boost` adds another 1.1x, so anything lit to a normal exposure clips to
// white and the screening layers have no tone left to bite on. Aim for surfaces
// around a third of full brightness before post.
const keyLight = new DirectionalLight(0xffffff, 1.1)
keyLight.position.set(2, 3, 4)
const fillLight = new AmbientLight(0xffffff, 0.3)
scene.add(keyLight, fillLight)

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
