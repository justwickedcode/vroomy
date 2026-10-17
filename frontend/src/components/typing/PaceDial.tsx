import { useRef } from 'react'
import { cn } from '#/lib/utils'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

// The custom-pace picker, in the same pixel dashboard language as a race: a green LCD readout
// with the pace zone you're in, and a chunky segmented bar you click or drag along (arrow keys
// work too) that lights up green, then yellow, then redline red. A marker shows your best.

export interface PaceZone {
  label: string
  wpm: [number, number]
}

export function zoneNameFor(zones: Array<PaceZone>, wpm: number) {
  const sorted = [...zones].sort((a, b) => a.wpm[0] - b.wpm[0])
  if (sorted.length === 0 || wpm < sorted[0].wpm[0]) return 'Parked'
  let name = sorted[0].label
  for (const zone of sorted) {
    if (wpm >= zone.wpm[0]) name = zone.label
  }
  return name
}

const GREEN = '#4ade80'
const YELLOW = '#facc15'
const RED = '#f43f5e'

// Green for a realistic pace, yellow as it gets serious, red once you're into the top two zones.
function paceColor(frac: number) {
  return frac < 0.4 ? GREEN : frac < 0.7 ? YELLOW : RED
}

export default function PaceDial({
  value,
  min,
  max,
  step = 5,
  majorTickStep = 50,
  zones = [],
  markerValue,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  majorTickStep?: number
  zones?: Array<PaceZone>
  markerValue?: number
  onChange: (next: number) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  // One segment per 10 wpm.
  const segments = Math.round(max / 10)
  const frac = (value - min) / (max - min)
  const lit = Math.round((value / max) * segments)
  const color = paceColor(frac)

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  function setFromPointer(clientX: number) {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = (clientX - rect.left) / rect.width
    onChange(clamp(Math.round((t * max) / step) * step))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setFromPointer(event.clientX)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setFromPointer(event.clientX)
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -step
          : 0
    if (!delta) return
    event.preventDefault()
    onChange(clamp(value + delta))
  }

  const ticks: Array<number> = []
  for (let v = 0; v <= max; v += majorTickStep) ticks.push(v)

  return (
    <div className="pace-picker" style={{ '--pace': color } as CSSProperties}>
      {/* The readout: big glowing digits on a recessed LCD. */}
      <div className="pace-lcd">
        <span className="pace-lcd-value">{value}</span>
        <span className="race-lcd-label">wpm</span>
      </div>
      <span className="race-announcer">{zoneNameFor(zones, value)}</span>

      <div className="w-full">
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="Bot pace"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="pace-bar"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        >
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              className={cn('pace-seg', i < lit && 'pace-seg--lit')}
              style={
                {
                  '--seg': paceColor((i + 0.5) / segments),
                } as CSSProperties
              }
            />
          ))}
          {markerValue !== undefined && markerValue > 0 && (
            <span
              className="pace-best"
              style={{ left: `${(Math.min(markerValue, max) / max) * 100}%` }}
              title={`Your best: ${markerValue} wpm`}
            >
              best
            </span>
          )}
        </div>
        <div className="pace-ticks">
          {ticks.map((v) => (
            <span key={v} style={{ left: `${(v / max) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
