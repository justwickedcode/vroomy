import { cn } from '#/lib/utils'

// A pixel-art speedometer: a 200° arc drawn on a 32x17 pixel grid whose blocks light up to the
// current value, in calm / working / redline bands like a real tachometer. Reserved for numbers
// with a meaningful ceiling (wpm, accuracy); a stat with no natural max (elapsed time) uses
// DigitalReadout instead.
const W = 32
const H = 17
const CX = 16
const CY = 16.5
const R_OUTER = 15.5
const R_INNER = 12.5
const SWEEP = 200

interface Cell {
  x: number
  y: number
  // 0 at the left end of the arc, 1 at the right.
  at: number
}

// The arc's pixels, computed once: every grid cell whose centre falls inside the ring and the
// sweep (angles measured from straight up).
const ARC: Array<Cell> = []
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - CX
    const dy = y + 0.5 - CY
    const dist = Math.hypot(dx, dy)
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (dist >= R_INNER && dist <= R_OUTER && Math.abs(angle) <= SWEEP / 2) {
      ARC.push({ x, y, at: (angle + SWEEP / 2) / SWEEP })
    }
  }
}

function zoneOf(at: number) {
  return at < 0.6 ? 'calm' : at < 0.85 ? 'working' : 'redline'
}

export default function Gauge({
  value,
  max,
  label,
  suffix = '',
  size,
}: {
  value: number
  max: number
  label: string
  suffix?: string
  size?: 'lg'
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0

  return (
    <div className={cn('gauge', size === 'lg' && 'gauge--lg')}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        shapeRendering="crispEdges"
        className="gauge-svg"
        aria-hidden="true"
      >
        {ARC.map((cell) => (
          <rect
            key={`${cell.x},${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={1}
            height={1}
            className={
              frac > 0 && cell.at <= frac
                ? `gauge-px gauge-px--${zoneOf(cell.at)}`
                : 'gauge-px gauge-px--off'
            }
          />
        ))}
      </svg>
      <div className="gauge-readout">
        <span className="gauge-value">
          {value}
          {suffix}
        </span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  )
}
