import { Color, PerspectiveCamera, Scene } from 'three/webgpu'

import { createBackdrop } from '@/gl/backdrop'
import { DragRotate } from '@/gl/logo/drag-rotate'
import { createLogoMesh } from '@/gl/logo/logo-mesh'
import { CartoonEffect } from '@/gl/post/cartoon-effect'
import { Renderer } from '@/gl/renderer'
import { FloatingSpheres } from '@/gl/spheres/floating-spheres'
import { Ticker } from '@/gl/ticker'
import '@/style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')
if (!canvas) throw new Error('#gl canvas not found')

const scene = new Scene()
// Only ever seen where the backdrop does not reach.
scene.background = new Color(0x0a0a18)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(0, 0, 3.2)

scene.add(createBackdrop())

const logo = createLogoMesh()
scene.add(logo)

const ticker = new Ticker()

const spheres = new FloatingSpheres(ticker)
scene.add(spheres.group)

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
