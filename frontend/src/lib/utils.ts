import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ClassValue } from 'clsx'
import type { MouseEvent } from 'react'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

const TILT_MAX_DEG = 10

// Pairs with the `.tilt-card` CSS class — plain event handlers rather than
// a hook so any element (including ones inside a .map()) can opt in just
// by spreading { onMouseMove: handleTiltMove, onMouseLeave: handleTiltLeave }
// without needing its own ref.
export function handleTiltMove(event: MouseEvent<HTMLElement>) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  const px = (event.clientX - rect.left) / rect.width - 0.5
  const py = (event.clientY - rect.top) / rect.height - 0.5
  el.style.setProperty('--ry', `${(px * TILT_MAX_DEG * 2).toFixed(2)}deg`)
  el.style.setProperty('--rx', `${(py * -TILT_MAX_DEG * 2).toFixed(2)}deg`)
}

export function handleTiltLeave(event: MouseEvent<HTMLElement>) {
  const el = event.currentTarget
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

export function ordinal(n: number) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
