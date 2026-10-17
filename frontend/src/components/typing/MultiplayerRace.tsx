import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Copy,
  Flag,
  PlayCircle,
  Users,
} from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import RaceTrack from '#/components/typing/RaceTrack'
import PixelSkyline from '#/components/typing/PixelSkyline'
import { PlayPanel, PlaySection, StartButton } from '#/components/play/PlayKit'
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

// The race's own countdown after the lobby wait (backend/ws's raceCountdown).
const RACE_COUNTDOWN_MS = 3000
// One start light per second for the last five seconds to GO (the end of backend/ws's lobby
// wait, after the newcomer's car has driven in, plus its race countdown).
const START_LIGHTS = 5
// How long "GO!" stays up once the race has started.
const GO_HOLD_MS = 800

// How long a lone racer waits in quick match before being offered a solo race instead.
const ALONE_WAIT_MS = 30000

// While the room fills, the typing screen holds the lobby instead of a quote.
//   Quick match: a hard 30s countdown while you're alone (then the offer to race bots instead),
//   and once a second racer is in, "get ready" while the track counts down to GO.
//   Friends: the room code to share, and the host's Start now.
function LobbyCard({ mp }: { mp: Mp }) {
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const canStart = mp.isHost && mp.playersInRoom >= mp.minPlayers
  const quick = !mp.code

  const startsSoon = mp.lobbyStartsAt !== null
  const aloneLeft =
    quick && mp.lobbySince !== null && mp.playersInRoom < mp.minPlayers
      ? Math.max(0, Math.ceil((mp.lobbySince + ALONE_WAIT_MS - now) / 1000))
      : null

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
      // Clipboard API unavailable (permissions, insecure context) — the code is still right
      // there on screen to copy by hand.
    }
  }

  return (
    <div className="race-results pointer-events-auto">
      <div className="flex flex-col gap-2">
        {quick ? (
          <>
            <span className="kicker">Quick match</span>
            <span className="font-display text-3xl uppercase">
              {startsSoon
                ? 'Get ready'
                : aloneLeft === 0
                  ? 'Nobody around'
                  : 'Finding racers'}
            </span>
          </>
        ) : (
          <>
            <span className="kicker">Room code</span>
            <span className="play-input flex items-center px-4 text-3xl tracking-[0.35em]">
              {mp.code}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        {aloneLeft !== null ? (
          <>
            <span className="font-display text-5xl leading-none">
              0:{String(aloneLeft).padStart(2, '0')}
            </span>
            <span className="race-lcd-label">waiting for racers</span>
          </>
        ) : (
          <>
            <span className="font-display text-5xl leading-none">
              {mp.playersInRoom}
              <span className="text-2xl text-[#8a7ca3]">/{mp.maxPlayers}</span>
            </span>
            <span className="race-lcd-label">
              {quick
                ? 'racers'
                : mp.isHost
                  ? canStart
                    ? 'start when ready'
                    : `need ${mp.minPlayers}`
                  : 'waiting for the host'}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {quick && aloneLeft === 0 && (
          <Button asChild>
            <Link to="/race/solo">
              <Flag />
              Race solo
            </Link>
          </Button>
        )}
        {!quick && mp.isHost && (
          <Button onClick={mp.startNow} disabled={!canStart}>
            <Users />
            Start now
          </Button>
        )}
        {mp.code && (
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="text-success" /> : <Copy />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        )}
      </div>
    </div>
  )
}

function ConnectingView() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8">
      <div className="page-wrap rise-in max-w-3xl">
        <PlayPanel>
          <div className="relative">
            <PixelSkyline className="h-32" />
            <p className="race-waiting absolute inset-x-0 bottom-3">
              Connecting
            </p>
          </div>
        </PlayPanel>
      </div>
    </main>
  )
}

function ErrorView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8">
      <div className="page-wrap rise-in max-w-3xl">
        <PlayPanel>
          <PlaySection label="Multiplayer">
            <p className="font-display text-2xl uppercase">Can't join</p>
            <p className="text-sm text-muted-foreground">
              {mp.errorMessage ?? 'Lost connection to the race server.'}
            </p>
          </PlaySection>
          <div className="bg-card p-4">
            <StartButton onClick={onLeave}>
              <ArrowLeft />
              Back
            </StartButton>
          </div>
        </PlayPanel>
      </div>
    </main>
  )
}

function RaceView({ mp, onLeave }: { mp: Mp; onLeave: () => void }) {
  const profile = useProfile()
  const { carModel, underglow, underglowColor, trail } = profile
  const inputRef = useRef<HTMLInputElement>(null)
  useKeepTypingFocus(inputRef, mp.phase === 'racing' && !mp.finished)

  // One countdown on the track, all the way to GO: in a public lobby it starts as soon as a
  // second racer joins (the server's short wait, plus the race's own countdown after it) and
  // carries straight on through the race countdown — never two countdowns in a row.
  const [goAt, setGoAt] = useState<number | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    setClock(Date.now())
    if (mp.phase === 'lobby') {
      setGoAt(
        mp.lobbyStartsAt !== null ? mp.lobbyStartsAt + RACE_COUNTDOWN_MS : null,
      )
    } else if (mp.phase === 'countdown') {
      // Already counting from the lobby: keep that GO time unless the server's differs by more
      // than a beat, so the numbers never repeat or skip at the handoff.
      const fresh = Date.now() + mp.startsInMs
      setGoAt((current) =>
        current !== null && Math.abs(current - fresh) < 1200 ? current : fresh,
      )
    } else if (mp.phase !== 'racing') {
      // Racing keeps the GO time, so "GO!" stays up for a beat after the start (below).
      setGoAt(null)
    }
  }, [mp.phase, mp.lobbyStartsAt, mp.startsInMs])
  const showingCountdown = goAt !== null && clock < goAt + GO_HOLD_MS
  useEffect(() => {
    if (!showingCountdown) return
    const id = setInterval(() => setClock(Date.now()), 100)
    return () => clearInterval(id)
  }, [showingCountdown])
  // The lights only come on once there are five seconds to go — before that, the newcomer's
  // car is still driving onto the grid.
  const toGo = goAt !== null ? goAt - clock : Infinity
  const counting = showingCountdown && toGo <= START_LIGHTS * 1000
  const countdown = Math.max(0, Math.ceil(toGo / 1000))

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

  // While waiting in the lobby, the grid is everyone in the room (by name — guests show as
  // "Racer"), each car driving in from the left as its player joins; once the race is on, it's
  // the live opponents.
  const inLobby = mp.phase === 'lobby'
  const lobbyRivals = Object.entries(mp.names)
    .filter(([id]) => id !== mp.myId)
    .map(([id, name], index) => ({
      id,
      name: name ?? 'Racer',
      progress: 0,
      wpm: 0,
      model: CAR_MODELS[(index + 1) % CAR_MODELS.length].id,
    }))
  const racers: Array<Racer> = [
    {
      id: mp.myId ?? 'you',
      name: inLobby && mp.isHost ? 'You · host' : 'You',
      progress: mp.progress,
      wpm: mp.wpm,
      finished: mp.finished,
      isYou: true,
      model: carModel,
      underglow,
      underglowColor,
      trail,
    },
    ...(inLobby ? lobbyRivals : []),
    ...(inLobby ? [] : mp.opponents).map((opponent, index) => ({
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
              phase={counting ? 'counting' : 'ready'}
              epic
              arrive={inLobby}
              lights={START_LIGHTS}
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
                  {inLobby && <LobbyCard mp={mp} />}
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
    default:
      return <RaceView mp={mp} onLeave={onLeave} />
  }
}
