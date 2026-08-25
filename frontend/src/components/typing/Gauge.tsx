import { cn } from '#/lib/utils'
import type { LucideIcon } from 'lucide-react'

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function Gauge({
  value,
  label,
  progress,
  icon: Icon,
}: {
  value: string
  label: string
  progress: number | null
  icon: LucideIcon
}) {
  const clamped = progress === null ? 0 : Math.max(0, Math.min(progress, 1))
  const offset = CIRCUMFERENCE * (1 - clamped)

  return (
    <div className="gauge">
      <svg viewBox="0 0 100 100" className="gauge-svg">
        <circle cx="50" cy="50" r="46" className="gauge-face" />
        <circle cx="50" cy="50" r={RADIUS} className="gauge-track" />
        {progress !== null && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            className="gauge-fill"
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: offset,
            }}
          />
        )}
      </svg>
      <div className="gauge-readout">
        <Icon
          className={cn('mb-0.5 size-3.5 text-primary')}
          strokeWidth={2.5}
        />
        <span className="gauge-value">{value}</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  )
}
