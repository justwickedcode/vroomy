import { useId, useState } from 'react'
import type { RaceRecord } from '#/lib/profile/useProfile'

const WIDTH = 600
const HEIGHT = 160
const PAD_X = 12
const PAD_Y = 16

export default function WpmTrend({ races }: { races: Array<RaceRecord> }) {
  const gradientId = useId()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // races come newest-first from the profile store; chart reads left-to-right
  // chronologically, oldest race on the left.
  const points = [...races].reverse()
  const max = Math.max(...points.map((p) => p.wpm), 1)
  const min = Math.min(...points.map((p) => p.wpm), 0)
  const range = Math.max(max - min, 1)

  const innerWidth = WIDTH - PAD_X * 2
  const innerHeight = HEIGHT - PAD_Y * 2

  const coords = points.map((point, i) => {
    const x =
      points.length > 1
        ? PAD_X + (i / (points.length - 1)) * innerWidth
        : PAD_X + innerWidth / 2
    const y = PAD_Y + innerHeight - ((point.wpm - min) / range) * innerHeight
    return { x, y, point }
  })

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ')
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT - PAD_Y} L${coords[0].x.toFixed(1)},${HEIGHT - PAD_Y} Z`
      : ''

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Run a few more races to see your WPM trend.
      </p>
    )
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Words per minute over your recent races"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-primary)"
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor="var(--color-primary)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke="var(--color-border)"
          strokeWidth="1"
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c, i) => (
          <g key={c.point.id}>
            <rect
              x={c.x - innerWidth / Math.max(points.length - 1, 1) / 2}
              y="0"
              width={innerWidth / Math.max(points.length - 1, 1)}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
            <circle
              cx={c.x}
              cy={c.y}
              r={i === hoverIndex ? 5 : 3}
              fill="var(--color-primary)"
              stroke="var(--color-card)"
              strokeWidth="1.5"
              className="transition-[r]"
            />
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="glass-chip pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100}%`,
          }}
        >
          <p className="font-bold">{hovered.point.wpm} wpm</p>
          <p className="text-muted-foreground">
            {new Date(hovered.point.date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  )
}
