import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  Gauge as GaugeIcon,
  Target,
  Timer,
  Trophy,
  Users,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import Gauge from '#/components/typing/Gauge'
import CarIcon, { CAR_MODELS } from '#/components/typing/CarIcon'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import type { Racer } from '#/components/typing/RaceTrack'

const WPM_GAUGE_MAX = 130
const OPPONENT_COLORS = ['#f59e0b', '#22c55e', '#ec4899', '#a855f7', '#38bdf8']

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

// Player IDs are opaque hex tokens (see backend/ws's newClientID) — there's no username system
// yet, so this is the closest thing to a readable label until one exists.
function shortName(id: string, myId: string | null) {
  if (id === myId) return 'You'
  return `Player ${id.replace(/^p_/, '').slice(0, 4)}`
}

type Mp = ReturnType<typeof useMultiplayerRace>

function LobbyView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
  const { carModel, carColor } = useProfile()
  const [copied, setCopied] = useState(false)
  const canStart = mp.isHost && mp.playersInRoom >= mp.minPlayers

  const shareLink =
    mp.code && typeof window !== 'undefined'
      ? `${window.location.origin}/race/${mp.code}`
      : mp.code

  async function handleCopy() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API unavailable (permissions, insecure context) — the code/link is still
      // right there on screen to copy by hand.
    }
  }

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="flex flex-col gap-4 pt-6 text-center">
            <Badge variant="outline" className="mx-auto">
              {mp.code ? 'Private room' : 'Quick match'} · waiting
            </Badge>

            {mp.code && (
              <>
                <p className="stat-figure text-3xl tracking-[0.2em] text-primary">
                  {mp.code}
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {shareLink}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="text-success" /> : <Copy />}
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              </>
            )}

            <div className="glass-chip flex items-center gap-3 rounded-lg p-3 text-left">
              <CarIcon
                color={carColor}
                model={carModel}
                className="aspect-[8/5] w-14"
              />
              <div>
                <p className="text-sm font-bold">You</p>
                <p className="text-xs text-muted-foreground">
                  {mp.playersInRoom} / {mp.maxPlayers} players (need{' '}
                  {mp.minPlayers} to start)
                </p>
              </div>
            </div>

            {mp.isHost ? (
              <div className="flex flex-col items-center gap-2">
                <Button
                  className="w-full"
                  onClick={mp.startNow}
                  disabled={!canStart}
                >
                  <Users />
                  Start now
                </Button>
                <p className="text-xs text-muted-foreground">
                  {canStart
                    ? 'Starts automatically soon, or start right now'
                    : `Waiting for at least ${mp.minPlayers} players`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for {mp.code ? 'the host to start, or for' : ''} the
                lobby to fill…
              </p>
            )}

            <button
              type="button"
              onClick={onLeave}
              className="text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 inline size-3" />
              Leave
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function ConnectingView() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <p className="kicker">Multiplayer</p>
      <p className="text-sm text-muted-foreground">Connecting…</p>
    </main>
  )
}

function ErrorView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <p className="kicker">Multiplayer</p>
      <h2 className="text-lg font-bold">Something went wrong</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {mp.errorMessage ?? 'Lost connection to the race server.'}
      </p>
      <Button variant="outline" onClick={onLeave}>
        <ArrowLeft />
        Back
      </Button>
    </main>
  )
}

function RaceView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
  const { carColor, carModel } = useProfile()
  const [countdown, setCountdown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mp.phase !== 'countdown') return
    setCountdown(Math.max(1, Math.ceil(mp.startsInMs / 1000)))
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [mp.phase, mp.startsInMs])

  useEffect(() => {
    if (mp.phase === 'racing') {
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [mp.phase])

  const racers: Array<Racer> = [
    {
      id: mp.myId ?? 'you',
      name: 'You',
      progress: mp.progress,
      wpm: mp.wpm,
      finished: mp.finished,
      isYou: true,
      color: carColor,
      model: carModel,
    },
    ...mp.opponents.map((opponent, index) => ({
      id: opponent.id,
      name: shortName(opponent.id, mp.myId) + (opponent.left ? ' (left)' : ''),
      progress: opponent.finished
        ? 1
        : mp.wordCount > 0
          ? Math.min(opponent.wordIndex / mp.wordCount, 1)
          : 0,
      wpm: opponent.wpm ?? 0,
      finished: opponent.finished,
      color: OPPONENT_COLORS[index % OPPONENT_COLORS.length],
      model: CAR_MODELS[(index + 1) % CAR_MODELS.length].id,
    })),
  ]

  return (
    <main className="flex-1 px-4 py-6">
      <div className="page-wrap flex flex-col">
        <Card className="rise-in flex flex-col overflow-hidden rounded-t-none">
          <CardContent className="flex flex-col p-0">
            <RaceTrack
              racers={racers}
              countdown={countdown}
              phase={mp.phase === 'countdown' ? 'counting' : 'ready'}
              className="flex-shrink-0"
            />

            <TypingWords
              spans={mp.spans}
              typed={mp.typed}
              activeWordIndex={mp.activeWordIndex}
              finished={mp.finished}
              locked={mp.phase !== 'racing'}
              errorSeq={mp.errorSeq}
              onInputChange={mp.handleInputChange}
              inputRef={inputRef}
              className="shrink-0"
              overlay={
                // We've finished but race_end hasn't arrived yet — that only happens once
                // everyone still connected has finished (or after 5 minutes), which has nothing
                // to do with OUR rank: the server already told us that the instant we crossed
                // the line (player_finished), so there's no reason to leave the screen blank
                // while someone else is still typing.
                mp.myResult &&
                mp.phase === 'racing' && (
                  <div className="countdown-overlay">
                    <div className="text-center">
                      <p className="text-lg font-bold">
                        Finished #{mp.myResult.rank} · {mp.myResult.wpm} wpm
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Waiting for other racers to finish…
                      </p>
                    </div>
                  </div>
                )
              }
            />
          </CardContent>

          {mp.phase === 'finished' && <div className="glass-divider" />}

          {mp.phase === 'finished' && (
            <div className="flex flex-col gap-4 bg-success/10 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Trophy className="size-6 shrink-0 text-success" />
                <p className="text-base leading-none">
                  {mp.myResult ? (
                    <>
                      Finished <strong>#{mp.myResult.rank}</strong> in{' '}
                      <strong>{formatTime(mp.myResult.elapsedMs)}</strong>
                    </>
                  ) : (
                    'Race finished'
                  )}
                </p>
              </div>

              {mp.results && (
                <ol className="flex flex-col gap-1.5">
                  {mp.results.map((result) => (
                    <li
                      key={result.playerId}
                      className={cn(
                        'flex items-center justify-between rounded-md px-3 py-1.5 text-sm',
                        result.playerId === mp.myId
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-muted-foreground',
                      )}
                    >
                      <span>
                        #{result.rank} {shortName(result.playerId, mp.myId)}
                      </span>
                      <span className="tabular-nums">
                        {result.wpm} wpm · {formatTime(result.elapsedMs)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={onLeave}>
                  <ArrowLeft />
                  Back to play
                </Button>
              </div>
            </div>
          )}

          {mp.phase !== 'finished' && (
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="kicker">
                {mp.phase === 'racing' ? 'Racing…' : 'Get ready…'}
              </p>
              <div className="flex items-center gap-4">
                <Gauge
                  icon={GaugeIcon}
                  label="wpm"
                  value={String(mp.wpm)}
                  progress={Math.min(mp.wpm / WPM_GAUGE_MAX, 1)}
                />
                <Gauge
                  icon={Target}
                  label="accuracy"
                  value={`${mp.accuracy}%`}
                  progress={mp.accuracy / 100}
                />
                <Gauge
                  icon={Timer}
                  label="time"
                  value={formatTime(mp.elapsedMs)}
                  progress={null}
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}

// The shared multiplayer race view — both auto-matchmaking (/race/multiplayer) and private
// lobbies (/race/$roomCode) render through this, differing only in what they pass as `mp`
// (which connect variant it used) and where `onLeave` navigates back to. Mirrors solo's
// TypingRace.tsx/RaceTrack/TypingWords/Gauge composition so both race types look and feel the
// same, just driven by server messages (useMultiplayerRace) instead of local bot simulation.
export default function MultiplayerRace({
  mp,
  onLeave,
}: {
  mp: Mp
  onLeave: () => void
}) {
  switch (mp.phase) {
    case 'connecting':
      return <ConnectingView />
    case 'error':
      return <ErrorView mp={mp} onLeave={onLeave} />
    case 'lobby':
      return <LobbyView mp={mp} onLeave={onLeave} />
    default:
      return <RaceView mp={mp} onLeave={onLeave} />
  }
}
