import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene } from 'three/webgpu'

import { createLogoMesh } from '@/gl/logo/logo-mesh'
import { Renderer } from '@/gl/renderer'
import { Ticker } from '@/gl/ticker'
import '@/style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')
if (!canvas) throw new Error('#gl canvas not found')

const scene = new Scene()
scene.background = new Color(0x101012)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(0, 0, 3.2)

// Key light off to the upper right so the bevel catches a highlight along the
// top and right edges; ambient keeps the unlit faces from going pure black.
const keyLight = new DirectionalLight(0xffffff, 2.5)
keyLight.position.set(2, 3, 4)
const fillLight = new AmbientLight(0xffffff, 0.6)
scene.add(keyLight, fillLight)

const logo = createLogoMesh()
scene.add(logo)

const ticker = new Ticker()

new Renderer({
  canvas,
  scene,
  camera,
  ticker,
  onResize: (width, height) => {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  },
})

ticker.start()
