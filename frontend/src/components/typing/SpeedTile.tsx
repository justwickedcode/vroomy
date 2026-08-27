import { Link } from '@tanstack/react-router'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

const MAX_WPM = SPEED_RANGES[SPEED_RANGES.length - 1].wpm[1]

export default function SpeedTile({
  range,
  index,
}: {
  range: SpeedRange
  index: number
}) {
  return (
    <Link
      to="/race/solo/$speed"
      params={{ speed: range.id }}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      className="tilt-card glass-chip flex flex-col gap-4 rounded-xl p-4 text-left transition-colors hover:border-primary/50"
    >
      <span className="font-mono text-xs text-muted-foreground">
        0{index + 1}
      </span>
      <div>
        <span className="block text-sm font-bold">{range.label}</span>
        <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground tabular-nums">
          {range.wpm[0]}–{range.wpm[1]} wpm
        </span>
      </div>
      <div className="flex h-1 gap-0.5" aria-hidden="true">
        {Array.from({ length: 10 }, (_, bar) => {
          const barWpm = ((bar + 1) / 10) * MAX_WPM
          const lit = barWpm <= range.wpm[1]
          return (
            <span
              key={bar}
              className="flex-1 rounded-full"
              style={{
                background: lit
                  ? 'var(--color-primary)'
                  : 'var(--color-border)',
              }}
            />
          )
        })}
      </div>
    </Link>
  )
}
