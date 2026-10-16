import { Link, createFileRoute } from '@tanstack/react-router'
import { PlayCircle } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { useProfile } from '#/lib/profile/useProfile'
import { ordinal } from '#/lib/utils'
import type { RaceMode } from '#/lib/api/types'

export const Route = createFileRoute('/replays/')({ component: ReplaysPage })

const MODE_LABELS: Record<RaceMode, string> = {
  solo: 'Solo',
  multiplayer: 'Multiplayer',
  daily: 'Daily',
}

function ReplaysPage() {
  const { hydrated, races, synced } = useProfile()
  // Optimistic rows (negative ids, see useProfile's addRace) have no replay to open yet.
  const withReplays = races.filter((r) => r.hasReplay && !r.id.startsWith('-'))

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        {!hydrated ? (
          <Card className="rise-in overflow-hidden">
            <CardContent className="flex flex-col gap-2 py-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-11 animate-pulse rounded-md bg-secondary/40"
                />
              ))}
            </CardContent>
          </Card>
        ) : withReplays.length === 0 ? (
          <Card className="rise-in overflow-hidden text-center">
            <CardHeader className="items-center py-10">
              <PlayCircle className="mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">No replays yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Finish a race and it shows up here.
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
            <CardContent className="flex flex-col gap-0.5 pt-4 pb-4">
              {withReplays.map((race) => (
                <Link
                  key={race.id}
                  to="/replays/$replayId"
                  params={{ replayId: race.id }}
                  className="grid grid-cols-[1.25rem_1fr_auto_auto] items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent/30 sm:grid-cols-[1.25rem_1fr_auto_auto_auto]"
                >
                  <PlayCircle className="size-4 text-primary" />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-muted-foreground">
                      {new Date(race.date).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 text-[0.6rem]"
                    >
                      {MODE_LABELS[race.mode ?? 'solo']}
                    </Badge>
                  </span>
                  <span className="stat-figure">{race.wpm} wpm</span>
                  <span className="hidden text-muted-foreground tabular-nums sm:inline">
                    {race.accuracy}% acc
                  </span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {race.racerCount > 1
                      ? `${ordinal(race.placement)} of ${race.racerCount}`
                      : 'Solo run'}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {hydrated && !synced && withReplays.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Guest replays are kept in this browser (the last 20).{' '}
            <a href="/login" className="font-semibold text-primary">
              Log in
            </a>{' '}
            to keep them for good.
          </p>
        )}
      </div>
    </main>
  )
}
