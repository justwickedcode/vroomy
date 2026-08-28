import { Link, createFileRoute } from '@tanstack/react-router'
import { Gauge, Medal, Target, Trophy, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import StatTile from '#/components/stats/StatTile'
import WpmTrend from '#/components/stats/WpmTrend'
import { useProfile } from '#/lib/profile/useProfile'
import { ordinal } from '#/lib/utils'

export const Route = createFileRoute('/stats')({ component: StatsPage })

const MEDAL_COLORS: Record<number, string> = {
  1: '#facc15',
  2: '#cbd5e1',
  3: '#c2703d',
}

function StatsPage() {
  const { hydrated, stats, races } = useProfile()

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Your stats.
          </h1>
        </div>

        {!hydrated || stats.racesPlayed === 0 ? (
          <Card className="rise-in overflow-hidden text-center">
            <CardHeader className="items-center py-10">
              <Trophy className="mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">No races yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Run your first race to start tracking history.
              </p>
            </CardHeader>
            <CardContent className="pb-10">
              <Button asChild>
                <Link to="/">Start racing</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rise-in overflow-hidden">
            <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4">
              <StatTile
                icon={Trophy}
                label="best wpm"
                value={String(stats.bestWpm)}
              />
              <StatTile
                icon={Gauge}
                label="avg wpm"
                value={String(stats.avgWpm)}
              />
              <StatTile
                icon={Target}
                label="avg accuracy"
                value={`${stats.avgAccuracy}%`}
              />
              <StatTile
                icon={Zap}
                label="races run"
                value={String(stats.racesPlayed)}
              />
            </CardContent>

            <div className="glass-divider" />

            <CardHeader className="py-5">
              <p className="kicker">WPM trend</p>
            </CardHeader>
            <CardContent className="pt-0">
              <WpmTrend races={races.slice(0, 20)} />
            </CardContent>

            <div className="glass-divider" />

            <CardHeader className="py-5">
              <p className="kicker">Recent races</p>
            </CardHeader>
            <CardContent className="pt-0 pb-6">
              <div className="flex flex-col gap-1">
                {races.slice(0, 10).map((race) => (
                  <div
                    key={race.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/30"
                  >
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
                    <span className="font-mono font-bold tabular-nums">
                      {race.wpm} wpm
                    </span>
                    <span className="hidden tabular-nums text-muted-foreground sm:inline">
                      {race.accuracy}% acc
                    </span>
                    <span className="tabular-nums whitespace-nowrap text-muted-foreground">
                      {ordinal(race.placement)} of {race.racerCount}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
