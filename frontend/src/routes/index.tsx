import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, ChevronRight, Flag, Link2, Users } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import Gauge from '#/components/typing/Gauge'
import DigitalReadout from '#/components/typing/DigitalReadout'
import RaceHistoryRow from '#/components/stats/RaceHistoryRow'
import CarIcon from '#/components/typing/CarIcon'
import { ACHIEVEMENTS } from '#/lib/achievements'
import { useProfile } from '#/lib/profile/useProfile'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'

export const Route = createFileRoute('/')({ component: Dashboard })

const WPM_GAUGE_MAX = 130

// Used to live on its own /play page — folded onto the dashboard so there's one landing page
// instead of two, since this was the very next thing anyone hit after "Start racing" anyway.
const MODES = [
  {
    to: '/race/solo',
    icon: Flag,
    title: 'Solo',
    detail: 'Race the clock against AI bots at your speed.',
  },
  {
    to: '/race/multiplayer',
    icon: Users,
    title: 'Multiplayer',
    detail: 'Get matched against real players.',
  },
  {
    to: '/race/friends',
    icon: Link2,
    title: 'With friends',
    detail: 'Create a room and send the link.',
  },
  {
    to: '/daily-challenge',
    icon: CalendarDays,
    title: 'Daily challenge',
    detail: 'One passage, same for everyone today.',
  },
] as const

// How many achievement chips the dashboard teaser shows — the full list lives on /achievements
// (grouped by category); this is just a taste, capped so it can't grow the dashboard card
// unbounded as more achievements are added over time.
const TEASER_COUNT = 6

function Dashboard() {
  const {
    hydrated,
    stats,
    races,
    carModel,
    carColor,
    underglow,
    underglowColor,
  } = useProfile()
  const hasRaced = hydrated && stats.racesPlayed > 0
  const unlockedCount = hydrated
    ? ACHIEVEMENTS.filter((a) => a.unlocked(stats, races)).length
    : 0
  // Earned badges first (so a returning player sees what they've already got), then whatever's
  // still locked, each group in its original declaration order — Array#sort is stable, so this
  // reorder doesn't scramble either group's own ordering.
  const teaserAchievements = [...ACHIEVEMENTS]
    .sort((a, b) => {
      const aDone = hydrated && a.unlocked(stats, races)
      const bDone = hydrated && b.unlocked(stats, races)
      return aDone === bDone ? 0 : aDone ? -1 : 1
    })
    .slice(0, TEASER_COUNT)

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-col gap-6">
        <Card className="rise-in overflow-hidden">
          <CardContent className="flex flex-col items-start gap-6 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="kicker mb-2">Vroomy</p>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Ready when you are.
              </h1>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Race real quotes against AI bots and watch your car cross the
                line first.
              </p>
              {hasRaced ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  Best run:{' '}
                  <span className="font-bold text-foreground">
                    {stats.bestWpm} wpm
                  </span>{' '}
                  across{' '}
                  <span className="font-bold text-foreground">
                    {stats.racesPlayed}
                  </span>{' '}
                  races. Pick a mode below to beat it.
                </p>
              ) : (
                <Button size="lg" className="mt-5" asChild>
                  <Link to="/race/solo">Start racing</Link>
                </Button>
              )}
            </div>

            <div className="race-track w-full sm:w-72">
              <div className="race-track-inner">
                <div className="race-track-fill" style={{ width: '55%' }} />
                <div className="race-track-start" />
              </div>
              <div className="race-car-wrap" style={{ left: '55%' }}>
                <CarIcon
                  color={carColor}
                  model={carModel}
                  underglow={underglow}
                  underglowColor={underglowColor}
                  className="race-car-svg race-car-bob w-32 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]"
                />
              </div>
              <span className="race-flag-checkered" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>

        <div>
          <p className="kicker mb-3">Play</p>
          {/* gap-px + bg-border, not divide-x/y: with 4 tiles wrapping from 1 to 2 to 4
              columns across breakpoints, Tailwind's divide utilities can't express "a line
              between every adjacent cell" once the grid wraps to more than one row — this
              collapsed-border trick (border-colored gap behind solid tiles) gives the same
              thin dividing lines regardless of how many rows the grid wraps to. */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {MODES.map(({ to, icon: Icon, title, detail }, i) => (
              <Link
                key={to}
                to={to}
                onMouseMove={handleTiltMove}
                onMouseLeave={handleTiltLeave}
                className="ignition group relative flex min-h-56 flex-col overflow-hidden bg-background p-6 transition-colors hover:bg-accent/40"
              >
                <span className="font-mono text-[0.65rem] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  Bay 0{i + 1}
                </span>
                <Icon
                  className="pointer-events-none absolute -right-6 -bottom-8 size-40 text-foreground/[0.05] transition-transform duration-500 ease-out group-hover:scale-110 group-hover:text-foreground/[0.07]"
                  strokeWidth={1}
                />
                <div className="relative mt-auto">
                  <p className="font-display text-2xl font-extrabold tracking-tight uppercase sm:text-3xl">
                    {title}
                  </p>
                  <p className="mt-2 max-w-64 text-sm text-muted-foreground">
                    {detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card className="rise-in overflow-hidden">
            <CardHeader className="flex-row items-center justify-between py-5">
              <p className="kicker">Your stats</p>
              <Link
                to="/stats"
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent className="flex flex-wrap justify-around gap-4 pt-0 pb-6">
              {!hydrated ? (
                [0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 w-[6.5rem] animate-pulse rounded-2xl bg-secondary/40"
                  />
                ))
              ) : (
                <>
                  <Gauge
                    label="best wpm"
                    value={hasRaced ? stats.bestWpm : 0}
                    max={WPM_GAUGE_MAX}
                  />
                  <Gauge
                    label="avg wpm"
                    value={hasRaced ? stats.avgWpm : 0}
                    max={WPM_GAUGE_MAX}
                  />
                  <Gauge
                    label="avg accuracy"
                    value={hasRaced ? stats.avgAccuracy : 0}
                    max={100}
                    suffix="%"
                  />
                  <DigitalReadout
                    label="races run"
                    value={hasRaced ? String(stats.racesPlayed) : '0'}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rise-in overflow-hidden">
            <CardHeader className="flex-row items-center justify-between py-5">
              <p className="kicker">Achievements</p>
              <span className="font-mono text-xs text-muted-foreground">
                {unlockedCount}/{ACHIEVEMENTS.length}
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 pt-0 pb-5">
              {teaserAchievements.map(({ icon: Icon, title, unlocked }) => {
                const done = hydrated && unlocked(stats, races)
                return (
                  <div
                    key={title}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5',
                      !done && 'opacity-45',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        done ? 'text-primary' : 'text-muted-foreground',
                      )}
                      strokeWidth={2.25}
                    />
                    <span className="truncate text-sm font-semibold">
                      {title}
                    </span>
                  </div>
                )
              })}
              <Link
                to="/achievements"
                className="mt-1 flex items-center gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                View all {ACHIEVEMENTS.length}
                <ChevronRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="rise-in overflow-hidden">
          <CardHeader className="py-5">
            <p className="kicker">Recent races</p>
          </CardHeader>
          <CardContent className="pt-0 pb-5">
            {!hydrated ? (
              <div className="h-24 w-full animate-pulse rounded-lg bg-secondary/40" />
            ) : hasRaced ? (
              <div className="flex flex-col gap-1">
                {races.slice(0, 5).map((race, i) => (
                  <RaceHistoryRow
                    key={race.id}
                    race={race}
                    lapNumber={stats.racesPlayed - i}
                  />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No races yet — your first run shows up here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
