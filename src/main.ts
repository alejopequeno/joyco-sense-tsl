import { Color, PerspectiveCamera, Scene } from 'three/webgpu'

import { Renderer } from '@/gl/renderer'
import { Ticker } from '@/gl/ticker'
import '@/style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#gl')
if (!canvas) throw new Error('#gl canvas not found')

const scene = new Scene()
scene.background = new Color(0x101012)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(0, 0, 3.2)

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
