import { Vector3, type Camera } from 'three'
import type { SatellitePoints } from './satellite-points'

const scratch = new Vector3()
const projected = new Vector3()
const cameraPos = new Vector3()

/**
 * True if the straight line from the camera to `p` passes through the Earth
 * (unit sphere at the origin) before reaching `p`.
 */
export function occludedByEarth(
  cx: number,
  cy: number,
  cz: number,
  px: number,
  py: number,
  pz: number,
): boolean {
  const dx = px - cx
  const dy = py - cy
  const dz = pz - cz
  const a = dx * dx + dy * dy + dz * dz
  const b = 2 * (cx * dx + cy * dy + cz * dz)
  const c = cx * cx + cy * cy + cz * cz - 1
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}

/**
 * Nearest visible satellite to a screen point, within `thresholdPx`.
 * Screen-space distance (rather than a world-space ray threshold) gives the
 * same click tolerance at any zoom. O(n), run on click only.
 * Returns the satellite index or -1.
 */
export function pickSatellite(
  points: SatellitePoints,
  mix: number,
  camera: Camera,
  screenX: number,
  screenY: number,
  widthPx: number,
  heightPx: number,
  thresholdPx: number,
): number {
  camera.getWorldPosition(cameraPos)
  const mask = points.maskAttr.array as Float32Array
  const limitSq = thresholdPx * thresholdPx
  let best = -1
  let bestDistSq = limitSq
  let bestDepth = Infinity

  for (let i = 0; i < points.count; i++) {
    if (mask[i]! < 0.5) continue
    if (!points.positionOf(i, mix, scratch)) continue
    projected.copy(scratch).project(camera)
    // Behind the camera or outside the depth range.
    if (projected.z < -1 || projected.z > 1) continue
    const sx = ((projected.x + 1) / 2) * widthPx
    const sy = ((1 - projected.y) / 2) * heightPx
    const dx = sx - screenX
    const dy = sy - screenY
    const distSq = dx * dx + dy * dy
    if (distSq > bestDistSq) continue
    if (occludedByEarth(cameraPos.x, cameraPos.y, cameraPos.z, scratch.x, scratch.y, scratch.z)) {
      continue
    }
    // Nearest on screen wins; within ~2 px, prefer the one closer to the camera.
    const clearlyCloser = distSq < bestDistSq - 4
    const nearTie = !clearlyCloser && projected.z < bestDepth
    if (clearlyCloser || nearTie) {
      best = i
      bestDistSq = distSq
      bestDepth = projected.z
    }
  }
  return best
}

/**
 * Turns pointer events on an element into click picks, ignoring drags so
 * rotating the globe never changes the selection.
 */
export class ClickPicker {
  private downX = 0
  private downY = 0
  private downTime = 0
  private pointerId = -1

  constructor(
    private readonly element: HTMLElement,
    private readonly onClick: (x: number, y: number) => void,
  ) {
    element.addEventListener('pointerdown', this.handleDown)
    element.addEventListener('pointerup', this.handleUp)
  }

  private readonly handleDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    this.pointerId = e.pointerId
    this.downX = e.clientX
    this.downY = e.clientY
    this.downTime = performance.now()
  }

  private readonly handleUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return
    this.pointerId = -1
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY)
    if (moved > 5 || performance.now() - this.downTime > 600) return
    const rect = this.element.getBoundingClientRect()
    this.onClick(e.clientX - rect.left, e.clientY - rect.top)
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handleDown)
    this.element.removeEventListener('pointerup', this.handleUp)
  }
}
