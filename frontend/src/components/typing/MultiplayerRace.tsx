import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Copy,
  PlayCircle,
  Users,
} from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import RaceTrack from '#/components/typing/RaceTrack'
import {
  PlayPanel,
  PlaySection,
  StartButton,
  TileGrid,
  tileClass,
} from '#/components/play/PlayKit'
import TypingWords from '#/components/typing/TypingWords'
import RaceConsole from '#/components/typing/RaceConsole'
import RaceResults from '#/components/typing/RaceResults'
import { POWERUPS, powerupLabel } from '#/lib/powerups'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'
import { CAR_MODELS } from '#/components/typing/CarIcon'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import type { Racer, RaceEffect } from '#/components/typing/RaceTrack'
import { useKeepTypingFocus } from '#/lib/typing/useKeepTypingFocus'

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
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      {/* The same play panel as the Play picker: the room, the starting grid, then go. */}
      <div className="page-wrap rise-in max-w-3xl">
        <PlayPanel>
          <PlaySection
            label={`${mp.code ? 'Private room' : 'Quick match'} · ${
              mp.mode === 'powerups' ? 'with abilities' : 'without abilities'
            }`}
            aside={
              <Button variant="ghost" size="sm" onClick={onLeave}>
                <ArrowLeft />
                Leave
              </Button>
            }
          >
            {mp.code ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="play-input flex items-center px-4 text-2xl tracking-[0.35em]">
                  {mp.code}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {shareLink}
                </span>
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="text-success" /> : <Copy />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Finding racers for you…
              </p>
            )}
          </PlaySection>

          <PlaySection
            label="Starting grid"
            aside={
              <span className="font-mono text-xs text-muted-foreground">
                {mp.playersInRoom}/{mp.maxPlayers}
              </span>
            }
          >
            <TileGrid className="grid-cols-2 sm:grid-cols-5">
              {seats.map((seat) => (
                <div
                  key={seat.pos}
                  className={cn(
                    tileClass(seat.isYou),
                    !seat.filled && 'opacity-50',
                  )}
                >
                  <span className="font-display text-lg text-muted-foreground">
                    P{seat.pos}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-bold">
                      {seat.isYou
                        ? 'You'
                        : seat.filled
                          ? (seat.name ?? 'Racer')
                          : 'Open seat'}
                      {seat.isYou && mp.isHost && (
                        <span className="ml-1.5 font-mono text-[0.6rem] text-signal">
                          HOST
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[0.6rem] tracking-widest uppercase',
                        seat.filled
                          ? 'text-[#4ade80]'
                          : 'text-muted-foreground',
                      )}
                    >
                      {seat.filled ? 'Ready' : 'Waiting'}
                    </span>
                  </span>
                </div>
              ))}
            </TileGrid>
          </PlaySection>

          <div className="flex flex-col items-center gap-2 bg-card p-4">
            {mp.isHost ? (
              <>
                <StartButton onClick={mp.startNow} disabled={!canStart}>
                  <Users />
                  Start now
                </StartButton>
                <p className="text-xs text-muted-foreground">
                  {canStart
                    ? 'Starts automatically soon, or start right now'
                    : `Waiting for at least ${mp.minPlayers} players`}
                </p>
              </>
            ) : (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Waiting for {mp.code ? 'the host to start, or for' : ''} the
                lobby to fill…
              </p>
            )}
          </div>
        </PlayPanel>
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
  useKeepTypingFocus(inputRef, mp.phase === 'racing' && !mp.finished)

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
  const [unlocks, setUnlocks] = useState<Array<UnlockedAchievement>>([])
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
        setUnlocks(saved.achievements)
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
    powerupsOn && mp.powerupReady && mp.phase === 'racing' && !mp.finished
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

  // Plays each announced ability on the car that used it, and says who used what. Abilities only
  // ever help their user (see #/lib/powerups), so nothing here touches anyone else.
  const [effect, setEffect] = useState<RaceEffect | null>(null)
  const [eventText, setEventText] = useState<string | null>(null)
  const { lastPowerup, myId, names } = mp
  useEffect(() => {
    if (!lastPowerup) return
    const { powerup, playerId, key } = lastPowerup
    const mine = playerId === myId
    setEffect({ kind: powerup, sourceId: playerId, key })
    const label = powerupLabel(powerup)
    setEventText(
      mine ? `${label}!` : `${shortName(playerId, myId, names)}: ${label}!`,
    )
    const timers = [
      setTimeout(() => setEffect(null), 900),
      setTimeout(() => setEventText(null), 2200),
    ]
    return () => {
      for (const t of timers) clearTimeout(t)
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
  // A full room's worth of lanes, always: seats nobody filled stay on the track as empty lanes
  // rather than the road shrinking to fit whoever showed up.
  for (let seat = racers.length; seat < (mp.maxPlayers || 5); seat++) {
    racers.push({
      id: `empty-${seat}`,
      name: '',
      progress: 0,
      wpm: 0,
      empty: true,
    })
  }

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap flex flex-col">
        {/* One connected panel, like solo: track, words, the dash console, then standings. */}
        <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
          <div className="relative flex flex-col">
            {/* What just happened, up in the sky over the track — never over your words. */}
            {eventText && !mp.finished && (
              <div className="pointer-events-none absolute top-2 right-3 z-10">
                <span className="race-announcer">{eventText}</span>
              </div>
            )}
            <RaceTrack
              racers={racers}
              countdown={countdown}
              phase={mp.phase === 'countdown' ? 'counting' : 'ready'}
              epic
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
                // Our result shows the instant we cross the line (player_finished) — race_end
                // only arrives once everyone still connected is done (or after 5 minutes), which
                // has nothing to do with OUR rank.
                <>
                  {mp.myResult && (
                    <RaceResults
                      place={mp.myResult.rank}
                      racerCount={Math.max(mp.racerCount, mp.myResult.rank)}
                      elapsedMs={mp.myResult.elapsedMs}
                      coinsEarned={coinsEarned}
                      unlocks={unlocks}
                      actions={
                        <>
                          {mp.phase !== 'finished' && (
                            <p className="race-waiting">Waiting for racers</p>
                          )}
                          {replayId && (
                            <Button asChild variant="outline">
                              <Link
                                to="/replays/$replayId"
                                params={{ replayId }}
                              >
                                <PlayCircle />
                                Replay
                              </Link>
                            </Button>
                          )}
                          <Button onClick={onLeave}>
                            <ArrowLeft />
                            Back
                          </Button>
                        </>
                      }
                    />
                  )}
                </>
              }
            />
          </div>

          <RaceConsole
            wpm={mp.myResult ? Math.round(mp.myResult.wpm) : mp.wpm}
            accuracy={mp.accuracy}
            elapsedMs={mp.myResult ? mp.myResult.elapsedMs : mp.elapsedMs}
            powerup={
              powerupsOn && equippedDef
                ? {
                    kind: equippedPowerup,
                    label: equippedDef.label,
                    detail: equippedDef.detail,
                    ready: mp.powerupReady && !mp.finished,
                    charge: mp.powerupCharge,
                    canFire,
                    onFire: () => firePowerup(equippedPowerup),
                  }
                : undefined
            }
            author={mp.quote?.author}
            sourceUrl={mp.quote?.sourceUrl}
          />

          {mp.phase === 'finished' && mp.results && (
            <div className="bg-card p-4">
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
            </div>
          )}
        </div>
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
