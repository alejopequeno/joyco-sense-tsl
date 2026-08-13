import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene } from 'three/webgpu'

import { createBackdrop } from '@/gl/backdrop'
import { debug } from '@/gl/debug/debug-tools'
import { HeroCycle } from '@/gl/hero/hero-cycle'
import { HeroDirector } from '@/gl/hero/hero-director'
import { DragRotate } from '@/gl/logo/drag-rotate'
import { CartoonEffect } from '@/gl/post/cartoon-effect'
import { senseStep } from '@/gl/post/sense-envelope'
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

// The sketch lights its scene neutrally and lets the material's colour
// spline do the talking: a warm white key from the upper right (where the
// reference's highlights sit), a dim cool fill from the left so shadows
// lean blue instead of black, and a warm ambient floor.
const keyLight = new DirectionalLight(0xfff2e0, 2.1)
keyLight.position.set(2.5, 3, 4)
const coolFill = new DirectionalLight(0xbfd0ff, 0.7)
coolFill.position.set(-3, -1, 2)
const ambient = new AmbientLight(0xfff0dd, 0.87)
scene.add(keyLight, coolFill, ambient)

const backdrop = createBackdrop()
scene.add(backdrop.mesh)

const heroes = await HeroCycle.create()
scene.add(heroes.group)

const ticker = new Ticker()

const spheres = new FloatingSpheres(ticker)
scene.add(spheres.group)

const dragRotate = new DragRotate(heroes.group, canvas, ticker)

const cartoon = new CartoonEffect()

const director = new HeroDirector({ autoCycle: false })

new Renderer({
  canvas,
  scene,
  camera,
  ticker,
  post: cartoon,
  debug,
  onResize: (width, height) => {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  },
})

let senseIntensity = 0
ticker.add((dt) => {
  const verdict = director.update(
    dt,
    senseIntensity,
    dragRotate.isDragging,
    dragRotate.isPosing
  )
  senseIntensity = senseStep(
    senseIntensity,
    dt,
    dragRotate.isDragging || dragRotate.isPosing || verdict.boost
  )
  if (verdict.swap) heroes.advance()
  heroes.update(dt)
  cartoon.setSenseIntensity(senseIntensity)
})

ticker.start()

// Collapsed — post-processing knobs, not the first thing worth seeing.
debug.folder('post', (folder) => cartoon.registerDebug(folder), { expanded: false })
debug.folder('look', (folder) => {
  backdrop.registerDebug(folder)
  for (const [label, light] of [
    ['key', keyLight],
    ['fill', coolFill],
    ['ambient', ambient],
  ] as const) {
    folder.addBinding(light, 'intensity', { label: `${label} intensity`, min: 0, max: 4 })
    folder.addBinding(light, 'color', { label: `${label} color`, color: { type: 'float' } })
  }
})
debug.folder('hero', (folder) => {
  folder.addButton({ title: 'next hero' }).on('click', () => director.trigger())
})
