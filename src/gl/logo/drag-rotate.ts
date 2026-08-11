import type { Object3D } from 'three/webgpu'

import { Disposer } from '@/gl/dispose'
import type { Ticker } from '@/gl/ticker'

/** Past this the logo reads edge-on and the silhouette collapses. */
export const MAX_PITCH = (80 * Math.PI) / 180

const RADIANS_PER_PIXEL = 0.005
const DAMPING = 3.5
const IDLE_YAW_SPEED = 0.15
/** Below this residual speed the idle spin takes back over. */
const IDLE_RESUME_VELOCITY = 0.05

/**
 * The presentation pose a tap snaps the logo to, tuned by eye against the
 * reference screenshot. Radians.
 */
export const POSE_YAW = -0.45
export const POSE_PITCH = 0.18
/** Exponential time constant of the pose tween. Snappy but not instant. */
const POSE_TAU = 0.16
/** How long the pose (and the spider-sense burst) holds before idle resumes. */
const POSE_HOLD_SECONDS = 1.6
/** Pointer travel below this on release counts as a tap, not a drag. */
const TAP_MAX_TRAVEL_PX = 6

const TAU_RADIANS = Math.PI * 2

export function clampPitch(pitch: number): number {
  return Math.min(Math.max(pitch, -MAX_PITCH), MAX_PITCH)
}

/** Signed shortest way from one angle to another, in (-π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  const raw = (((to - from + Math.PI) % TAU_RADIANS) + TAU_RADIANS) % TAU_RADIANS
  return raw - Math.PI
}

/**
 * One exponential step of the pose tween. Same frame-rate-independence
 * argument as `decayVelocity`; the delta goes through `shortestAngleDelta`
 * so an idle spin that has wound past 2π still tweens the short way.
 */
export function poseStep(current: number, target: number, dt: number): number {
  return current + shortestAngleDelta(current, target) * (1 - Math.exp(-dt / POSE_TAU))
}

/**
 * Exponential decay, so two 8ms steps land exactly where one 16ms step does.
 * A per-frame `velocity *= 0.95` does not hold that property: the same gesture
 * coasts twice as far on a 120Hz display as on a 60Hz one.
 */
export function decayVelocity(velocity: number, dt: number, damping: number = DAMPING): number {
  return velocity * Math.exp(-damping * dt)
}

/**
 * Rotates an object by pointer drag, with inertia on release and a slow idle
 * spin when it comes to rest. Yaw and pitch are tracked as separate scalars
 * rather than as a quaternion trackball: more predictable, and no accumulated
 * roll.
 */
export class DragRotate {
  private readonly target: Object3D
  private readonly disposer = new Disposer()

  private yaw = 0
  private pitch = 0
  private yawVelocity = 0
  private pitchVelocity = 0

  private dragging = false
  private lastX = 0
  private lastY = 0
  // Rotation accumulated since the last tick. Velocity is derived from this
  // over the ticker's dt, so a stalled frame cannot produce a huge
  // instantaneous fling.
  private pendingYaw = 0
  private pendingPitch = 0

  private posing = false
  private poseTimer = 0
  // Pointer distance accumulated during the current gesture, to tell a tap
  // from a drag on release.
  private travel = 0

  /** True while a pointer is actively dragging. Feeds the spider-sense envelope. */
  get isDragging(): boolean {
    return this.dragging
  }

  /** True while the logo is tweening to (and holding) the tap pose. */
  get isPosing(): boolean {
    return this.posing
  }

  constructor(target: Object3D, element: HTMLElement, ticker: Ticker) {
    this.target = target
    // Yaw must apply before pitch or the two axes cross-contaminate and the
    // logo picks up roll it was never given.
    target.rotation.order = 'YXZ'

    const onPointerDown = (event: PointerEvent): void => {
      this.dragging = true
      this.lastX = event.clientX
      this.lastY = event.clientY
      this.yawVelocity = 0
      this.pitchVelocity = 0
      this.posing = false
      this.travel = 0
      // Keeps the gesture alive when the pointer leaves the canvas.
      element.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging) return
      this.travel +=
        Math.abs(event.clientX - this.lastX) + Math.abs(event.clientY - this.lastY)
      this.pendingYaw += (event.clientX - this.lastX) * RADIANS_PER_PIXEL
      this.pendingPitch += (event.clientY - this.lastY) * RADIANS_PER_PIXEL
      this.lastX = event.clientX
      this.lastY = event.clientY
    }

    const onPointerUp = (event: PointerEvent): void => {
      if (!this.dragging) return
      this.dragging = false
      if (this.travel < TAP_MAX_TRAVEL_PX) {
        this.posing = true
        this.poseTimer = 0
        this.yawVelocity = 0
        this.pitchVelocity = 0
      }
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    // A `pointercancel` (browser claiming the gesture, touch interrupted) must
    // settle the drag exactly like a release, or the controller stays stuck
    // dragging forever.
    element.addEventListener('pointercancel', onPointerUp)
    this.disposer.add(() => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
    })

    this.disposer.add(ticker.add((dt) => this.update(dt)))
  }

  private update(dt: number): void {
    if (this.dragging) {
      this.yaw += this.pendingYaw
      this.pitch = clampPitch(this.pitch + this.pendingPitch)
      // The velocity a release would inherit: this frame's travel over its dt.
      // Holding still zeroes it, so a stationary release does not fling.
      if (dt > 0) {
        this.yawVelocity = this.pendingYaw / dt
        this.pitchVelocity = this.pendingPitch / dt
      }
      this.pendingYaw = 0
      this.pendingPitch = 0
    } else if (this.posing) {
      this.poseTimer += dt
      this.yaw = poseStep(this.yaw, POSE_YAW, dt)
      this.pitch = clampPitch(poseStep(this.pitch, POSE_PITCH, dt))
      if (this.poseTimer >= POSE_HOLD_SECONDS) this.posing = false
    } else {
      this.yawVelocity = decayVelocity(this.yawVelocity, dt)
      this.pitchVelocity = decayVelocity(this.pitchVelocity, dt)
      const idleYaw = Math.abs(this.yawVelocity) < IDLE_RESUME_VELOCITY ? IDLE_YAW_SPEED : 0
      this.yaw += (this.yawVelocity + idleYaw) * dt
      this.pitch = clampPitch(this.pitch + this.pitchVelocity * dt)
    }

    this.target.rotation.set(this.pitch, this.yaw, 0)
  }

  dispose(): void {
    this.disposer.dispose()
  }
}
