import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Gauge, Target, Trophy, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import StatTile from '#/components/stats/StatTile'
import RaceHistoryRow from '#/components/stats/RaceHistoryRow'
import CarIcon from '#/components/typing/CarIcon'
import { ACHIEVEMENTS } from '#/lib/achievements'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const { hydrated, stats, races, carModel, carColor } = useProfile()
  const hasRaced = hydrated && stats.racesPlayed > 0
  const unlockedCount = hydrated
    ? ACHIEVEMENTS.filter((a) => a.unlocked(stats, races)).length
    : 0

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
              <Button size="lg" className="mt-5" asChild>
                <Link to="/play">Start racing</Link>
              </Button>
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
                  className="race-car-svg race-car-bob aspect-[8/5] w-32 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]"
                />
              </div>
              <span className="race-flag-checkered" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
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
              <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-4">
                <StatTile
                  icon={Trophy}
                  label="best wpm"
                  value={hasRaced ? String(stats.bestWpm) : '—'}
                />
                <StatTile
                  icon={Gauge}
                  label="avg wpm"
                  value={hasRaced ? String(stats.avgWpm) : '—'}
                />
                <StatTile
                  icon={Target}
                  label="avg accuracy"
                  value={hasRaced ? `${stats.avgAccuracy}%` : '—'}
                />
                <StatTile
                  icon={Zap}
                  label="races run"
                  value={hasRaced ? String(stats.racesPlayed) : '0'}
                />
              </CardContent>
            </Card>

            <Card className="rise-in overflow-hidden">
              <CardHeader className="py-5">
                <p className="kicker">Recent races</p>
              </CardHeader>
              <CardContent className="pt-0 pb-5">
                {hasRaced ? (
                  <div className="flex flex-col gap-1">
                    {races.slice(0, 5).map((race) => (
                      <RaceHistoryRow key={race.id} race={race} />
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

          <Card className="rise-in overflow-hidden">
            <CardHeader className="flex-row items-center justify-between py-5">
              <p className="kicker">Achievements</p>
              <span className="font-mono text-xs text-muted-foreground">
                {unlockedCount}/{ACHIEVEMENTS.length}
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 pt-0 pb-5">
              {ACHIEVEMENTS.map(({ icon: Icon, title, unlocked }) => {
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
                View all
                <ChevronRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
