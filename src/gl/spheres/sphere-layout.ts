/**
 * Orbit definitions and position math for the floating spheres, kept pure so
 * the drift can be tested without three. Values are hand-placed, not random:
 * post-cartoon-iii scatters its spheres deliberately — near/far, big/small —
 * and a seeded layout would just be these numbers with extra steps.
 */

export type SphereOrbit = {
  /** Distance from the logo centre, world units. */
  radius: number
  /** Orbit plane tilt off the screen plane, radians. */
  tilt: number
  /** Start angle, radians. */
  phase: number
  /** Radians per second. Slow — these drift, they do not orbit visibly. */
  speed: number
  /** Sphere radius, world units. */
  scale: number
  /** Vertical bob distance, world units. */
  bobAmplitude: number
  /** Bob cycles per second, in radians. */
  bobFrequency: number
}

export const SPHERE_ORBITS: readonly SphereOrbit[] = [
  { radius: 1.6, tilt: 0.5, phase: 0.4, speed: 0.11, scale: 0.34, bobAmplitude: 0.05, bobFrequency: 0.7 },
  { radius: 1.9, tilt: -0.3, phase: 1.7, speed: 0.08, scale: 0.2, bobAmplitude: 0.07, bobFrequency: 0.5 },
  { radius: 1.4, tilt: 0.9, phase: 2.9, speed: 0.13, scale: 0.14, bobAmplitude: 0.04, bobFrequency: 0.9 },
  { radius: 2.2, tilt: 0.2, phase: 4.0, speed: 0.06, scale: 0.42, bobAmplitude: 0.06, bobFrequency: 0.4 },
  { radius: 1.7, tilt: -0.7, phase: 5.1, speed: 0.1, scale: 0.16, bobAmplitude: 0.05, bobFrequency: 0.8 },
  { radius: 2.0, tilt: 0.6, phase: 5.9, speed: 0.09, scale: 0.26, bobAmplitude: 0.08, bobFrequency: 0.6 },
]

/**
 * Position on a tilted circular orbit plus a vertical bob. The z-axis
 * component is halved so the ring hugs the screen plane: spheres pass beside
 * the logo, not through the camera or the backdrop.
 */
export function spherePosition(
  orbit: SphereOrbit,
  elapsed: number
): { x: number; y: number; z: number } {
  const angle = orbit.phase + orbit.speed * elapsed
  const bob = Math.sin(elapsed * orbit.bobFrequency) * orbit.bobAmplitude
  return {
    x: Math.cos(angle) * orbit.radius,
    y: Math.sin(angle) * orbit.radius * Math.sin(orbit.tilt) + bob,
    z: Math.sin(angle) * orbit.radius * Math.cos(orbit.tilt) * 0.5,
  }
}
