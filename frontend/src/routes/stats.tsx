import { Link, createFileRoute } from '@tanstack/react-router'
import { Gauge, Target, Trophy, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import StatTile from '#/components/stats/StatTile'
import WpmTrend from '#/components/stats/WpmTrend'
import RaceHistoryRow from '#/components/stats/RaceHistoryRow'
import { useProfile } from '#/lib/profile/useProfile'

export const Route = createFileRoute('/stats')({ component: StatsPage })

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
                  <RaceHistoryRow key={race.id} race={race} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
