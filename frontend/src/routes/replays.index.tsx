import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, Flag, PlayCircle, Users } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import PixelMeter from '#/components/ui/PixelMeter'
import PixelSkyline from '#/components/typing/PixelSkyline'
import { useProfile } from '#/lib/profile/useProfile'
import { cn, ordinal } from '#/lib/utils'
import type { RaceMode } from '#/lib/api/types'

export const Route = createFileRoute('/replays/')({ component: ReplaysPage })

const MODES: Record<RaceMode, { label: string; icon: typeof Flag }> = {
  solo: { label: 'Solo', icon: Flag },
  multiplayer: { label: 'Multiplayer', icon: Users },
  daily: { label: 'Daily', icon: CalendarDays },
}

// Same scale as the dashboard's WPM meters.
const WPM_METER_MAX = 130

// One connected panel, like the dashboard: a wall of replay tiles whose cells share single lines.
const PANEL =
  'rise-in px-corners flex flex-1 flex-col gap-[2px] border-2 border-border bg-border'
const CELL = 'bg-card'

function ReplaysPage() {
  const { hydrated, races } = useProfile()
  // Optimistic rows (negative ids, see useProfile's addRace) have no replay to open yet.
  const withReplays = races.filter((r) => r.hasReplay && !r.id.startsWith('-'))

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {!hydrated ? (
          <div className={PANEL}>
            <div className={cn(CELL, 'flex-1 animate-pulse')} />
          </div>
        ) : withReplays.length === 0 ? (
          <div className={PANEL}>
            <PixelSkyline className="h-40 sm:h-56" />
            <div
              className={cn(
                CELL,
                'flex flex-1 flex-col items-center justify-center gap-4 py-12',
              )}
            >
              <PlayCircle className="size-12" />
              <p className="font-display text-2xl uppercase">No replays yet</p>
              <Button asChild>
                <Link to="/">Start racing</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className={PANEL}>
            {/* Title in the sky, like the dashboard's title screen. */}
            <div className="relative">
              <PixelSkyline className="h-32 sm:h-40" />
              <h1 className="absolute top-4 left-5 font-display text-3xl uppercase [text-shadow:3px_3px_0_#1a0b2e] sm:text-4xl">
                Replays
                <span className="ml-2 text-xl text-white/60">
                  {withReplays.length}
                </span>
              </h1>
            </div>
            <div
              className={cn(
                CELL,
                'grid flex-1 content-start grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 [&>*]:shadow-[0_0_0_1px_var(--color-border)]',
              )}
            >
              {withReplays.map((race) => {
                const { label, icon: Icon } = MODES[race.mode ?? 'solo']
                return (
                  <Link
                    key={race.id}
                    to="/replays/$replayId"
                    params={{ replayId: race.id }}
                    className="group flex flex-col gap-3 bg-card p-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-6 shrink-0" />
                      <span className="text-sm font-semibold">{label}</span>
                      <PlayCircle className="ml-auto size-5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="font-display text-3xl leading-none">
                      {race.wpm}
                      <span className="ml-1 text-base text-muted-foreground">
                        wpm
                      </span>
                    </p>
                    <PixelMeter frac={race.wpm / WPM_METER_MAX} />
                    <div className="flex justify-between font-mono text-xs text-muted-foreground">
                      <span>
                        {new Date(race.date).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>
                        {race.accuracy}%
                        {race.racerCount > 1 &&
                          ` · ${ordinal(race.placement)}/${race.racerCount}`}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
