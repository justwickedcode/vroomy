import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, PlayCircle } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import ReplayPlayer from '#/components/replay/ReplayPlayer'
import DesktopOnlyRace from '#/components/typing/DesktopOnlyRace'
import PlayerAvatar from '#/components/social/PlayerAvatar'
import { useIsDesktopViewport } from '#/lib/layout/useIsDesktopViewport'
import { getReplayFn } from '#/lib/api/functions'
import { getLocalReplay } from '#/lib/replay/localReplays'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { ordinal } from '#/lib/utils'
import type { CarModel } from '#/components/typing/CarIcon'
import type { RaceMode, ReplayData } from '#/lib/api/types'

export const Route = createFileRoute('/replays/$replayId')({
  component: ReplayPage,
})

interface LoadedReplay {
  replay: ReplayData
  driverName: string
  avatarUrl?: string
  carModel?: CarModel
  mine: boolean
  date: string
  mode: RaceMode
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
}

const MODE_LABELS: Record<RaceMode, string> = {
  solo: 'Solo race',
  multiplayer: 'Multiplayer race',
  daily: 'Daily challenge',
}

// Server replays have numeric ids (race_results.id); a guest's local ones don't (see
// useProfile's addLocalRace), which is how one route serves both.
function isServerId(id: string) {
  return /^\d+$/.test(id)
}

function useReplay(replayId: string): {
  data: LoadedReplay | null | undefined
  isError: boolean
} {
  const profile = useProfile()
  const { user } = useCurrentUser()
  const server = useQuery({
    queryKey: ['replay', replayId],
    queryFn: () => getReplayFn({ data: Number(replayId) }),
    enabled: isServerId(replayId),
    staleTime: Infinity,
  })

  // Local replays are read after mount (localStorage isn't there during SSR).
  const [local, setLocal] = useState<LoadedReplay | null | undefined>(undefined)
  const race = profile.races.find((r) => r.id === replayId)
  useEffect(() => {
    if (isServerId(replayId) || !profile.hydrated) return
    const replay = getLocalReplay(replayId)
    setLocal(
      replay && race
        ? {
            replay,
            driverName: 'You',
            carModel: profile.carModel,
            mine: true,
            date: race.date,
            mode: race.mode ?? 'solo',
            wpm: race.wpm,
            accuracy: race.accuracy,
            placement: race.placement,
            racerCount: race.racerCount,
          }
        : null,
    )
  }, [replayId, profile.hydrated, race, profile.carModel])

  if (!isServerId(replayId)) return { data: local, isError: false }
  if (server.isError) return { data: undefined, isError: true }
  if (server.data === undefined) return { data: undefined, isError: false }
  const r = server.data
  if (r === null) return { data: null, isError: false }
  return {
    data: {
      replay: { passage: r.passage, events: r.events },
      driverName: r.displayName || 'Racer',
      avatarUrl: r.avatarUrl,
      carModel: r.carModel,
      // Matched by id against the player's own synced history — the replay response itself
      // doesn't expose whose account it belongs to.
      mine: user !== null && profile.races.some((own) => own.id === replayId),
      date: r.date,
      mode: r.mode,
      wpm: r.wpm,
      accuracy: r.accuracy,
      placement: r.placement,
      racerCount: r.racerCount,
    },
    isError: false,
  }
}

function ReplayPage() {
  const { replayId } = Route.useParams()
  const { data, isError } = useReplay(replayId)
  // Same gate as the live race: the track is built for a desktop-width screen.
  const isDesktop = useIsDesktopViewport()

  if (isDesktop === false) return <DesktopOnlyRace />
  if (isDesktop === null) return null

  return (
    <main className="flex-1 px-4 py-6">
      <div className="page-wrap flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/replays">
              <ArrowLeft /> All replays
            </Link>
          </Button>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <PlayerAvatar name={data.driverName} avatarUrl={data.avatarUrl} />
              <span className="font-semibold">
                {data.mine ? 'Your run' : `${data.driverName}'s run`}
              </span>
              <Badge variant="outline">{MODE_LABELS[data.mode]}</Badge>
              <span className="text-muted-foreground">
                {data.wpm} wpm · {data.accuracy}%
                {data.racerCount > 1 &&
                  ` · ${ordinal(data.placement)} of ${data.racerCount}`}{' '}
                ·{' '}
                {new Date(data.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>

        <Card className="rise-in flex flex-col overflow-hidden">
          {isError ? (
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Couldn't load this replay. Try again in a moment.
            </CardContent>
          ) : data === undefined ? (
            <CardContent className="flex flex-col gap-3 py-6">
              <div className="h-40 animate-pulse rounded-lg bg-secondary/40" />
              <div className="h-24 animate-pulse rounded-lg bg-secondary/40" />
            </CardContent>
          ) : data === null ? (
            <CardHeader className="items-center py-10 text-center">
              <PlayCircle className="mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">Replay not found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                It may have been from a guest session in another browser.
              </p>
            </CardHeader>
          ) : (
            <CardContent className="p-0">
              <ReplayPlayer
                key={replayId}
                replay={data.replay}
                driverName={data.mine ? 'You' : data.driverName}
                carModel={data.carModel}
                finalAccuracy={data.accuracy}
              />
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  )
}
