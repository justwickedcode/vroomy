import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  Flag,
  PlayCircle,
  Users,
} from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import ReplayPlayer from '#/components/replay/ReplayPlayer'
import DesktopOnlyRace from '#/components/typing/DesktopOnlyRace'
import PlayerAvatar from '#/components/social/PlayerAvatar'
import { useIsDesktopViewport } from '#/lib/layout/useIsDesktopViewport'
import { getReplayFn } from '#/lib/api/functions'
import { getLocalReplay } from '#/lib/replay/localReplays'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { ordinal } from '#/lib/utils'
import { lookFromApi } from '#/lib/carLook'
import type { CarLook } from '#/lib/carLook'
import type { RaceMode, ReplayData } from '#/lib/api/types'

export const Route = createFileRoute('/replays/$replayId')({
  component: ReplayPage,
})

interface LoadedReplay {
  replay: ReplayData
  driverName: string
  avatarUrl?: string
  // The driver's car as they had it dressed — yours for your own local replays.
  look: CarLook
  mine: boolean
  date: string
  mode: RaceMode
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
}

const MODE_LABELS: Record<RaceMode, string> = {
  solo: 'Solo',
  multiplayer: 'Multiplayer',
  daily: 'Daily',
}

const MODE_ICONS: Record<RaceMode, typeof Flag> = {
  solo: Flag,
  multiplayer: Users,
  daily: CalendarDays,
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
            look: {
              model: profile.carModel,
              underglow: profile.underglow,
              underglowColor: profile.underglowColor,
              trail: profile.trail,
            },
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
  }, [
    replayId,
    profile.hydrated,
    race,
    profile.carModel,
    profile.underglow,
    profile.underglowColor,
    profile.trail,
  ])

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
      look: lookFromApi(r),
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
  const ModeIcon = data ? MODE_ICONS[data.mode] : Flag

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap">
        {/* One connected panel: a header strip with whose run it is, then the player. */}
        <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card p-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/replays">
                <ArrowLeft /> Replays
              </Link>
            </Button>
            {data && (
              <>
                <span className="flex items-center gap-2">
                  <PlayerAvatar
                    name={data.driverName}
                    avatarUrl={data.avatarUrl}
                  />
                  <span className="font-semibold">
                    {data.mine ? 'Your run' : `${data.driverName}'s run`}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-sm">
                  <ModeIcon className="size-5" />
                  {MODE_LABELS[data.mode]}
                </span>
                <span className="ml-auto flex items-baseline gap-4 font-mono text-xs text-muted-foreground">
                  <span className="font-display text-2xl text-foreground">
                    {data.wpm}
                    <span className="ml-1 text-sm text-muted-foreground">
                      wpm
                    </span>
                  </span>
                  <span>{data.accuracy}%</span>
                  {data.racerCount > 1 && (
                    <span>
                      {ordinal(data.placement)}/{data.racerCount}
                    </span>
                  )}
                  <span>
                    {new Date(data.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
              </>
            )}
          </div>

          <div className="bg-card">
            {isError ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Couldn't load this replay. Try again in a moment.
              </p>
            ) : data === undefined ? (
              <div className="h-72 animate-pulse bg-secondary/30" />
            ) : data === null ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <PlayCircle className="size-12" />
                <p className="font-display text-2xl uppercase">Not found</p>
              </div>
            ) : (
              <ReplayPlayer
                key={replayId}
                replay={data.replay}
                driverName={data.mine ? 'You' : data.driverName}
                look={data.look}
                finalAccuracy={data.accuracy}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
