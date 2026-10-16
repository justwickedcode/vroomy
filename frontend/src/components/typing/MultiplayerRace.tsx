import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, Copy, PlayCircle, Trophy, Users } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import QuoteCredit from '#/components/typing/QuoteCredit'
import PixelIcon from '#/components/ui/PixelIcon'
import { POWERUPS } from '#/lib/powerups'
import Coins from '#/components/ui/Coins'
import Gauge from '#/components/typing/Gauge'
import DigitalReadout from '#/components/typing/DigitalReadout'
import { CAR_MODELS } from '#/components/typing/CarIcon'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import type { Racer, RaceEffect } from '#/components/typing/RaceTrack'

const WPM_GAUGE_MAX = 130

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

// A player's display name when they connected with one (logged-in players do — see
// useMultiplayerRace's ?name=), otherwise a label built from their opaque id (backend/ws's
// newClientID).
function shortName(
  id: string,
  myId: string | null,
  names: Record<string, string | undefined>,
) {
  if (id === myId) return 'You'
  return names[id] ?? `Player ${id.replace(/^p_/, '').slice(0, 4)}`
}

type Mp = ReturnType<typeof useMultiplayerRace>

function LobbyView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
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

  // Slot 1 is always us; the others are everyone else in the room, by name when they have one
  // (guests connect without a name and show as "Racer").
  const others = Object.entries(mp.names)
    .filter(([id]) => id !== mp.myId)
    .map(([, name]) => name)
  const seats = Array.from({ length: mp.maxPlayers }, (_, i) => ({
    pos: i + 1,
    filled: i < mp.playersInRoom,
    isYou: i === 0,
    name: i > 0 ? others[i - 1] : undefined,
  }))

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="flex flex-col gap-5 pt-6">
            <Badge variant="outline" className="w-fit">
              {mp.code ? 'Private room' : 'Quick match'}
              {mp.mode === 'powerups' ? ' · power-ups' : ' · classic'} · waiting
            </Badge>

            {mp.code && (
              <div>
                <div className="license-plate">
                  <span>{mp.code}</span>
                  <span className="license-plate-tab">Share to invite</span>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {shareLink}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="text-success" /> : <Copy />}
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              </div>
            )}

            <div className="starting-grid">
              {seats.map((seat) => (
                <div
                  key={seat.pos}
                  className={cn(
                    'starting-grid-slot',
                    seat.isYou && 'is-you',
                    !seat.filled && 'is-empty',
                  )}
                >
                  <span className="starting-grid-pos">P{seat.pos}</span>
                  <span
                    className={cn(
                      'starting-grid-dot',
                      seat.isYou && 'is-you',
                      seat.filled && !seat.isYou && 'is-filled',
                    )}
                  />
                  <span className="starting-grid-name">
                    {seat.isYou ? (
                      <>
                        You
                        {mp.isHost && (
                          <span className="starting-grid-flag">HOST</span>
                        )}
                      </>
                    ) : seat.filled ? (
                      (seat.name ?? 'Racer')
                    ) : (
                      'Open seat'
                    )}
                  </span>
                  <span
                    className={cn(
                      'starting-grid-state',
                      !seat.filled && 'is-waiting',
                    )}
                  >
                    {seat.filled ? 'Ready' : 'Waiting'}
                  </span>
                </div>
              ))}
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
              <p className="text-center text-xs text-muted-foreground">
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
  const profile = useProfile()
  const { carModel, underglow, underglowColor, trail } = profile
  const [countdown, setCountdown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mp.phase !== 'countdown') return
    setCountdown(Math.max(1, Math.ceil(mp.startsInMs / 1000)))
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [mp.phase, mp.startsInMs])

  // Saved to history the moment our own result arrives (player_finished), not at race_end — the
  // rank is final then, and the player may leave before everyone else finishes. WPM is the
  // server's figure, computed from its own word count and our elapsed time.
  const recordedQuoteRef = useRef<string | null>(null)
  const { myResult, getReplay } = mp
  // This race's replay, once saved — for the "Watch replay" button on the results screen.
  const [replayId, setReplayId] = useState<string | null>(null)
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null)
  useEffect(() => {
    if (!myResult || recordedQuoteRef.current === mp.text) return
    recordedQuoteRef.current = mp.text
    void profile
      .addRace({
        wpm: Math.round(myResult.wpm),
        accuracy: mp.accuracy,
        placement: myResult.rank,
        racerCount: Math.max(mp.racerCount, myResult.rank),
        mode: 'multiplayer',
        replay: getReplay(),
      })
      .then((saved) => {
        setReplayId(saved.replayId)
        setCoinsEarned(saved.coinsEarned)
      })
  }, [
    myResult,
    mp.text,
    mp.accuracy,
    mp.racerCount,
    getReplay,
    profile.addRace,
  ])

  useEffect(() => {
    if (mp.phase === 'racing') {
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [mp.phase])

  // ── Powerups (powerup lobbies only) ────────────────────────────────
  const powerupsOn = mp.mode === 'powerups'
  const { equippedPowerup } = profile
  const equippedDef = POWERUPS.find((p) => p.id === equippedPowerup)
  const canFire =
    powerupsOn && !mp.powerupUsed && mp.phase === 'racing' && !mp.finished
  const { firePowerup } = mp

  // Tab fires the powerup, same as solo. Swallowed during any race so it never moves focus off
  // the hidden typing input.
  useEffect(() => {
    if (mp.phase !== 'racing' || mp.finished) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      event.preventDefault()
      if (canFire) firePowerup(equippedPowerup)
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mp.phase, mp.finished, canFire, firePowerup, equippedPowerup])

  // Plays each announced powerup on the track: a burst on our own car for boost/nitro, a hit on
  // the target's lane for shell/magnet, and a full-track flash for EMP/nuke.
  const [effect, setEffect] = useState<RaceEffect | null>(null)
  const [eventText, setEventText] = useState<string | null>(null)
  const { lastPowerup, myId, names } = mp
  useEffect(() => {
    if (!lastPowerup) return
    const { powerup, playerId, targets, key } = lastPowerup
    const mine = playerId === myId
    const selfOnly = powerup === 'boost' || powerup === 'nitro'
    if (!selfOnly || mine) {
      setEffect({
        kind: powerup,
        targetId:
          powerup === 'shell' || powerup === 'magnet' ? targets[0] : undefined,
        key,
      })
    }
    const label = POWERUPS.find((p) => p.id === powerup)?.label ?? powerup
    const by = mine ? 'You' : shortName(playerId, myId, names)
    const hitMe = myId !== null && targets.includes(myId)
    setEventText(
      hitMe
        ? `${by} hit you with ${label}!`
        : mine
          ? `${label}!`
          : `${by} used ${label}`,
    )
    const clearEffect = setTimeout(() => setEffect(null), 650)
    const clearText = setTimeout(() => setEventText(null), 2200)
    return () => {
      clearTimeout(clearEffect)
      clearTimeout(clearText)
    }
  }, [lastPowerup, myId, names])

  const racers: Array<Racer> = [
    {
      id: mp.myId ?? 'you',
      name: 'You',
      progress: mp.progress,
      wpm: mp.wpm,
      finished: mp.finished,
      isYou: true,
      model: carModel,
      underglow,
      underglowColor,
      trail,
    },
    ...mp.opponents.map((opponent, index) => ({
      id: opponent.id,
      name:
        shortName(opponent.id, mp.myId, mp.names) +
        (opponent.left ? ' (left)' : ''),
      progress: opponent.finished
        ? 1
        : mp.wordCount > 0
          ? Math.min(opponent.wordIndex / mp.wordCount, 1)
          : 0,
      wpm: opponent.wpm ?? 0,
      finished: opponent.finished,
      model: CAR_MODELS[(index + 1) % CAR_MODELS.length].id,
    })),
  ]

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap flex flex-col">
        <Card className="rise-in flex flex-col overflow-hidden">
          <CardContent className="flex flex-col p-0">
            <RaceTrack
              racers={racers}
              countdown={countdown}
              phase={mp.phase === 'countdown' ? 'counting' : 'ready'}
              effect={effect}
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
                <>
                  {mp.myResult && mp.phase === 'racing' && (
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
                  )}
                  {(mp.frozen || eventText) && !mp.finished && (
                    <div className="pointer-events-none absolute top-3 right-3 z-10">
                      <span
                        className={cn(
                          'rounded-full px-3 py-1 text-[0.7rem] font-semibold',
                          mp.frozen
                            ? 'bg-sky-500/90 text-white'
                            : 'bg-secondary/80 text-muted-foreground',
                        )}
                      >
                        {mp.frozen ? `Frozen! ${eventText ?? ''}` : eventText}
                      </span>
                    </div>
                  )}
                </>
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
              {powerupsOn && equippedDef && !mp.finished ? (
                <button
                  type="button"
                  onClick={() => firePowerup(equippedPowerup)}
                  disabled={!canFire}
                  title={equippedDef.detail}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-opacity',
                    canFire ? 'hover:text-foreground' : 'opacity-40',
                  )}
                >
                  <PixelIcon name={equippedPowerup} />
                  {equippedDef.label}
                  <span>{mp.powerupUsed ? '· used' : '· once per race'}</span>
                  {!mp.powerupUsed && (
                    <kbd className="rounded border border-border px-1 font-mono text-[0.65rem]">
                      Tab
                    </kbd>
                  )}
                </button>
              ) : (
                <span />
              )}
              <QuoteCredit
                author={mp.quote?.author}
                sourceUrl={mp.quote?.sourceUrl}
              />
            </div>
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
                {coinsEarned !== null && (
                  <Coins
                    amount={coinsEarned}
                    prefix="+"
                    className="text-sm text-signal"
                  />
                )}
              </div>

              {mp.results && (
                <div className="standings">
                  <div className="standings-head">
                    <span>Pos</span>
                    <span>Racer</span>
                    <span>Wpm</span>
                    <span className="text-right">Time</span>
                  </div>
                  {mp.results.map((result) => (
                    <div
                      key={result.playerId}
                      className={cn(
                        'standings-row',
                        result.playerId === mp.myId && 'is-you',
                      )}
                    >
                      <span className="standings-pos">P{result.rank}</span>
                      <span className="standings-name">
                        {shortName(result.playerId, mp.myId, mp.names)}
                      </span>
                      <span className="standings-wpm">{result.wpm}</span>
                      <span className="standings-time">
                        {formatTime(result.elapsedMs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3">
                {replayId && (
                  <Button asChild variant="outline">
                    <Link to="/replays/$replayId" params={{ replayId }}>
                      <PlayCircle />
                      Watch replay
                    </Link>
                  </Button>
                )}
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
                <Gauge label="wpm" value={mp.wpm} max={WPM_GAUGE_MAX} />
                <Gauge
                  label="accuracy"
                  value={mp.accuracy}
                  max={100}
                  suffix="%"
                />
                <DigitalReadout label="time" value={formatTime(mp.elapsedMs)} />
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
