import { Link, createFileRoute } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronRight,
  Flag,
  Link2,
  Users,
} from '#/components/ui/icons'
import Coins from '#/components/ui/Coins'
import PixelMeter from '#/components/ui/PixelMeter'
import RaceTrack from '#/components/typing/RaceTrack'
import RaceHistoryRow from '#/components/stats/RaceHistoryRow'
import WpmTrend from '#/components/stats/WpmTrend'
import { ACHIEVEMENTS, achievementReward } from '#/lib/achievements'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { cn } from '#/lib/utils'
import type { ReactNode } from 'react'

export const Route = createFileRoute('/')({ component: Dashboard })

// Where the WPM meters top out — a strong typist sits near the top, nobody is pinned at full.
const WPM_METER_MAX = 130

const MODES = [
  { to: '/race/solo', icon: Flag, title: 'Solo' },
  { to: '/race/multiplayer', icon: Users, title: 'Multiplayer' },
  { to: '/race/friends', icon: Link2, title: 'Friends' },
  { to: '/daily-challenge', icon: CalendarDays, title: 'Daily' },
] as const

// How many races the WPM trend chart and the recent-races list show.
const TREND_RACES = 20
const RECENT_RACES = 10

// How many still-locked achievements the "Next up" list shows.
const NEXT_UP_COUNT = 3

// The dashboard is one connected panel, like a game HUD: every section is a cell in a grid whose
// 2px gaps show the border color behind them, so neighbors share a single dividing line and
// there's no empty space between blocks. A grid that can leave a cell empty on narrow screens
// spans its last item instead, so no gap ever shows as a stray block.
const CELL = 'bg-card'

function StatCell({
  label,
  value,
  meter,
  color,
  className,
}: {
  label: string
  value: ReactNode
  meter?: number
  color?: string
  className?: string
}) {
  return (
    <div className={cn(CELL, 'flex flex-col gap-2 p-4', className)}>
      <p className="kicker">{label}</p>
      <p className="font-display text-3xl leading-none">{value}</p>
      {meter !== undefined && <PixelMeter frac={meter} color={color} />}
    </div>
  )
}

// The title-screen scene: a police chase — you out front, four cruisers on your tail.
interface ShowcaseRacer {
  id: string
  name: string
  progress: number
  // Fraction of your speed shown on their WPM readout.
  pace: number
}

// Lanes top to bottom; the player takes the middle one (see Dashboard).
const CHASERS: Array<ShowcaseRacer> = [
  { id: 'cop-1', name: 'Interceptor', progress: 0.36, pace: 0.92 },
  { id: 'cop-2', name: 'Pursuit', progress: 0.22, pace: 0.86 },
  { id: 'cop-3', name: 'Hunter', progress: 0.3, pace: 0.9 },
  { id: 'cop-4', name: 'Patrol', progress: 0.14, pace: 0.83 },
]

// Your car's position: far ahead of the pack.
const LEAD_PROGRESS = 0.66

function Dashboard() {
  const {
    hydrated,
    stats,
    races,
    coins,
    achievements,
    carModel,
    underglow,
    underglowColor,
    trail,
  } = useProfile()
  const { user } = useCurrentUser()
  const hasRaced = hydrated && stats.racesPlayed > 0
  const unlocked = hydrated ? achievements : []
  // The next achievements to go for, in the catalog's own easiest-first order.
  const nextUp = ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id)).slice(
    0,
    NEXT_UP_COUNT,
  )

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {/* Fills the screen: the last two rows stretch to the bottom instead of leaving empty
            space under the panel. */}
        <div className="rise-in px-corners grid flex-1 grid-rows-[auto_auto_auto_auto_1fr] gap-[2px] border-2 border-border bg-border">
          {/* Hero: your own car cruising, like a game's title screen. */}
          <div className={cn(CELL, 'relative')}>
            <RaceTrack
              racers={(() => {
                const youWpm = hasRaced ? Math.max(stats.avgWpm, 40) : 40
                const others = CHASERS.map(({ pace, ...racer }) => ({
                  ...racer,
                  model: 'police',
                  // Cruisers: smoke only, with a blue neon underglow.
                  trail: 'smoke' as const,
                  underglow: true,
                  underglowColor: '#3b82f6',
                  wpm: Math.round(youWpm * pace),
                }))
                const you = {
                  id: 'you',
                  name: user?.name ?? 'You',
                  progress: LEAD_PROGRESS,
                  wpm: youWpm,
                  isYou: true,
                  model: carModel,
                  underglow,
                  underglowColor,
                  trail,
                }
                return [...others.slice(0, 2), you, ...others.slice(2)]
              })()}
              phase="ready"
              finishLine={false}
              epic
            />
            {/* The title sits in the sky like a game's title screen, with a hard pixel shadow. */}
            <h1 className="pointer-events-none absolute top-4 left-5 text-3xl font-extrabold tracking-tight [text-shadow:3px_3px_0_#1a0b2e] sm:top-5 sm:text-4xl">
              Ready when you are.
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-[2px] lg:grid-cols-4">
            {MODES.map(({ to, icon: Icon, title }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  CELL,
                  'group flex items-center gap-3 p-4 transition-colors hover:bg-accent',
                )}
              >
                <Icon className="size-8 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="font-display text-xl uppercase">{title}</span>
                <ChevronRight className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-[2px] lg:grid-cols-5">
            {!hydrated ? (
              <div className={cn(CELL, 'col-span-full h-28 animate-pulse')} />
            ) : (
              <>
                <StatCell
                  label="Best"
                  value={
                    <>
                      {stats.bestWpm}
                      <span className="ml-1 text-base text-muted-foreground">
                        wpm
                      </span>
                    </>
                  }
                  meter={stats.bestWpm / WPM_METER_MAX}
                />
                <StatCell
                  label="Average"
                  value={
                    <>
                      {stats.avgWpm}
                      <span className="ml-1 text-base text-muted-foreground">
                        wpm
                      </span>
                    </>
                  }
                  meter={stats.avgWpm / WPM_METER_MAX}
                  color="var(--color-primary)"
                />
                <StatCell
                  label="Accuracy"
                  value={`${stats.avgAccuracy}%`}
                  meter={stats.avgAccuracy / 100}
                  color="var(--color-success)"
                />
                <StatCell label="Races" value={stats.racesPlayed} />
                <StatCell
                  label="Coins"
                  value={<Coins amount={coins} className="text-signal" />}
                  className="col-span-2 lg:col-span-1"
                />
              </>
            )}
          </div>

          {/* Your WPM over recent races (what used to be the separate Stats page). */}
          <section className={cn(CELL, 'p-5')}>
            <p className="kicker mb-3">WPM trend</p>
            {!hydrated ? (
              <div className="h-40 animate-pulse bg-secondary/40" />
            ) : (
              <WpmTrend races={races.slice(0, TREND_RACES)} />
            )}
          </section>

          <div className="grid grid-cols-1 gap-[2px] lg:grid-cols-3">
            <section className={cn(CELL, 'p-5 lg:col-span-2')}>
              <p className="kicker mb-3">Recent races</p>
              {!hydrated ? (
                <div className="h-24 animate-pulse bg-secondary/40" />
              ) : hasRaced ? (
                <div className="flex flex-col gap-1">
                  {races.slice(0, RECENT_RACES).map((race, i) => (
                    <RaceHistoryRow
                      key={race.id}
                      race={race}
                      lapNumber={stats.racesPlayed - i}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No races yet
                </p>
              )}
            </section>

            <section className={cn(CELL, 'flex flex-col gap-4 p-5')}>
              <div className="flex items-center justify-between">
                <p className="kicker">Achievements</p>
                <Link
                  to="/achievements"
                  className="font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {unlocked.length}/{ACHIEVEMENTS.length}
                </Link>
              </div>
              {/* One block per achievement. */}
              <PixelMeter
                frac={unlocked.length / ACHIEVEMENTS.length}
                segments={ACHIEVEMENTS.length}
                className="gap-[2px]"
              />
              {nextUp.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="kicker">Next up</p>
                  {nextUp.map(({ id, icon: Icon, title, detail }) => (
                    <div key={id} className="flex items-center gap-2.5 py-1.5">
                      <Icon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {detail}
                        </span>
                      </span>
                      <Coins
                        amount={achievementReward(id)}
                        prefix="+"
                        className="shrink-0 text-xs text-signal"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">All unlocked</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
