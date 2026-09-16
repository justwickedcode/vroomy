import { Medal } from 'lucide-react'
import { cn, ordinal } from '#/lib/utils'
import type { RaceRecord } from '#/lib/profile/useProfile'

const MEDAL_COLORS: Record<number, string> = {
  1: '#facc15',
  2: '#cbd5e1',
  3: '#c2703d',
}

export default function RaceHistoryRow({
  race,
  lapNumber,
}: {
  race: RaceRecord
  lapNumber: number
}) {
  return (
    <div className="grid grid-cols-[2.75rem_1fr_auto_auto_auto] items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/30">
      <span className="stat-figure text-xs text-muted-foreground">
        {String(lapNumber).padStart(3, '0')}
      </span>
      <span className="flex items-center gap-2 truncate font-semibold text-muted-foreground">
        {race.placement <= 3 && (
          <Medal
            className="size-3.5 shrink-0"
            style={{ color: MEDAL_COLORS[race.placement] }}
          />
        )}
        {new Date(race.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </span>
      <span className="stat-figure text-sm">{race.wpm} wpm</span>
      <span className="hidden tabular-nums text-muted-foreground sm:inline">
        {race.accuracy}% acc
      </span>
      <span
        className={cn(
          'tabular-nums whitespace-nowrap',
          race.placement === 1
            ? 'font-semibold text-signal'
            : 'text-muted-foreground',
        )}
      >
        {ordinal(race.placement)} of {race.racerCount}
      </span>
    </div>
  )
}
