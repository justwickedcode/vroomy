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

  // A stepped line (across, then up/down) rather than diagonals — the pixel-art way to draw a
  // chart, matching the rest of the UI.
  const linePath = coords
    .map((c, i) =>
      i === 0
        ? `M${c.x.toFixed(0)},${c.y.toFixed(0)}`
        : `H${c.x.toFixed(0)} V${c.y.toFixed(0)}`,
    )
    .join(' ')
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT - PAD_Y} L${coords[0].x.toFixed(1)},${HEIGHT - PAD_Y} Z`
      : ''

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Not enough races yet
      </p>
    )
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        shapeRendering="crispEdges"
        className="w-full"
        role="img"
        aria-label="Words per minute over your recent races"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-signal)"
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor="var(--color-signal)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={PAD_X}
            y1={PAD_Y + innerHeight * frac}
            x2={WIDTH - PAD_X}
            y2={PAD_Y + innerHeight * frac}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />

        {coords.map((c, i) => {
          const isLast = i === coords.length - 1
          return (
            <g key={c.point.id}>
              <rect
                x={c.x - innerWidth / Math.max(points.length - 1, 1) / 2}
                y="0"
                width={innerWidth / Math.max(points.length - 1, 1)}
                height={HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
              />
              {(() => {
                const size = i === hoverIndex ? 10 : isLast ? 8 : 6
                return (
                  <rect
                    x={c.x - size / 2}
                    y={c.y - size / 2}
                    width={size}
                    height={size}
                    fill="var(--color-signal)"
                    stroke="var(--color-card)"
                    strokeWidth="2"
                  />
                )
              })()}
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div
          className="glass-chip pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2.5 py-1.5 text-xs whitespace-nowrap"
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
