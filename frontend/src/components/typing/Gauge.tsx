import { cn } from '#/lib/utils'

// A 200° automotive-style sweep (not a full ring) — ticks, a needle, and a three-zone arc that
// only fills as far as the needle, same shape as a real tachometer's calm/working/redline
// bands. Reserved specifically for numbers with a meaningful ceiling (wpm, accuracy); a stat
// with no natural max (elapsed time) has nothing to point a needle at and uses a plain digital
// readout instead — see DigitalReadout.
const SWEEP = 200
const START = -100
const CX = 80
const CY = 88
const RADIUS = 62
const TICK_COUNT = 10

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = ((a1 - a0) % 360) > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
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
  const needleAngle = START + SWEEP * frac
  const [needleX, needleY] = polar(CX, CY, RADIUS - 16, needleAngle)

  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const angle = START + (SWEEP * i) / TICK_COUNT
    const major = i % 5 === 0
    const [x1, y1] = polar(CX, CY, RADIUS + 8, angle)
    const [x2, y2] = polar(CX, CY, RADIUS + (major ? 14 : 11), angle)
    return { key: i, x1, y1, x2, y2, width: major ? 1.6 : 1 }
  })

  const z1to = Math.min(frac, 0.6)
  const z2to = Math.min(frac, 0.85)

  return (
    <div className={cn('gauge', size === 'lg' && 'gauge--lg')}>
      <svg viewBox="0 0 160 100" className="gauge-svg">
        <path
          d={arcPath(CX, CY, RADIUS, START, START + SWEEP)}
          className="gauge-track"
        />
        {frac > 0 && (
          <path
            d={arcPath(CX, CY, RADIUS, START, START + SWEEP * z1to)}
            className="gauge-zone gauge-zone-calm"
          />
        )}
        {frac > 0.6 && (
          <path
            d={arcPath(CX, CY, RADIUS, START + SWEEP * 0.6, START + SWEEP * z2to)}
            className="gauge-zone gauge-zone-working"
          />
        )}
        {frac > 0.85 && (
          <path
            d={arcPath(CX, CY, RADIUS, START + SWEEP * 0.85, START + SWEEP * frac)}
            className="gauge-zone gauge-zone-redline"
          />
        )}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            className="gauge-tick"
            strokeWidth={t.width}
          />
        ))}
        <line x1={CX} y1={CY} x2={needleX} y2={needleY} className="gauge-needle" />
        <circle cx={CX} cy={CY} r="5" className="gauge-hub" />
        <circle cx={CX} cy={CY} r="2" className="gauge-hub-center" />
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
