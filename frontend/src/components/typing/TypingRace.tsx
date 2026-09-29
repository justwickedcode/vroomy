import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, Medal, RotateCcw, Sparkles, Trophy, Zap } from 'lucide-react'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useBotRacers } from '#/lib/typing/useBotRacers'
import { useProfile } from '#/lib/profile/useProfile'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { ordinal } from '#/lib/utils'
import { isAchievementUnlocked } from '#/lib/achievements'
import { POWERUPS } from '#/lib/powerups'
import RaceTrack from '#/components/typing/RaceTrack'
import Gauge from '#/components/typing/Gauge'
import DigitalReadout from '#/components/typing/DigitalReadout'
import TypingWords from '#/components/typing/TypingWords'
import type { Racer } from '#/components/typing/RaceTrack'
import type { SpeedRange } from '#/lib/typing/useBotRacers'
import type { PowerupKind } from '#/lib/powerups'

const POWERUP_ICONS: Record<PowerupKind, typeof Zap> = {
  boost: Zap,
  shell: Crosshair,
}

// Words between spawns is randomized in this range so pickups don't land on a predictable
// cadence — re-rolled every time one is granted or used.
const SPAWN_EVERY_WORDS: [number, number] = [3, 6]

function randomSpawnGap() {
  const [min, max] = SPAWN_EVERY_WORDS
  return min + Math.floor(Math.random() * (max - min + 1))
}

const MEDAL_COLORS: Record<number, string> = {
  1: '#facc15',
  2: '#cbd5e1',
  3: '#c2703d',
}

const WPM_GAUGE_MAX = 130

// Solo vs AI has nobody else to wait on, so the countdown just needs to be
// long enough to get fingers on the keys — not a real multiplayer-room wait.
const RACE_COUNTDOWN_START = 3

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

export default function TypingRace({ speedRange }: { speedRange: SpeedRange }) {
  const {
    text,
    spans,
    typed,
    activeWordIndex,
    finished,
    started,
    startedAt,
    elapsedMs,
    wpm,
    accuracy,
    progress,
    errorSeq,
    handleInputChange,
    skipWord,
    start,
    reset,
  } = useTypingRace()

  const profile = useProfile()

  const { bots, hitBot } = useBotRacers({
    raceKey: text,
    started,
    startedAt,
    textLength: text.length,
    playerFinished: finished,
    wpmRange: speedRange.wpm,
    count: 4,
  })

  const inputRef = useRef<HTMLInputElement>(null)
  // 'waiting' and 'counting' are both locked (input disabled) — only
  // 'ready' lets the player type. Kept as one linear phase (rather than
  // deriving "locked" from countdown !== null with a null gap in between)
  // because a gap there was a real bug: the input briefly unlocked during
  // the pre-countdown pause, let typing start for real, then re-locked
  // out from under it once the visual countdown kicked in.
  const [phase, setPhase] = useState<'waiting' | 'counting' | 'ready'>(
    'waiting',
  )
  const [countdown, setCountdown] = useState(RACE_COUNTDOWN_START)

  const locked = phase !== 'ready'

  useEffect(() => {
    if (!locked) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [finished, locked, phase])

  // Races start from a server-broadcast event in the real design — every
  // player in the room gets the same countdown at once, nobody clicks to
  // begin. Simulated here with a short "waiting for race" delay before the
  // countdown fires automatically, for every fresh sentence while a
  // opponent is chosen (initial race, "Race Again", and "New Sentence").
  useEffect(() => {
    setPhase('waiting')
    setCountdown(RACE_COUNTDOWN_START)
    const t = setTimeout(() => setPhase('counting'), 600)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    if (phase !== 'counting') return
    if (countdown === 0) {
      const t = setTimeout(() => {
        setPhase('ready')
        start()
        inputRef.current?.focus()
      }, 450)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, start])

  // ── Powerups ─────────────────────────────────────────────────────
  // Spawns roughly every 3-6 words typed (see randomSpawnGap) while the player holds none —
  // ties the cadence to actual typing progress instead of a wall-clock timer, so slower typists
  // don't get flooded and faster ones don't wait around.
  const [powerup, setPowerup] = useState<PowerupKind | null>(null)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const nextSpawnAtRef = useRef(randomSpawnGap())
  const eventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPowerup(null)
    setLastEvent(null)
    nextSpawnAtRef.current = randomSpawnGap()
  }, [text])

  // Spawns whichever powerup the player has equipped (see Garage's Powerups section) — falls
  // back to boost (no requiresAchievement, always safe) if the equipped kind's achievement
  // somehow isn't unlocked, e.g. a saved profile pointing at one from before it was earned.
  const equippedDef = POWERUPS.find((p) => p.id === profile.equippedPowerup)
  const equippedUnlocked =
    profile.hydrated &&
    (!equippedDef?.requiresAchievement ||
      isAchievementUnlocked(
        equippedDef.requiresAchievement,
        profile.stats,
        profile.races,
      ))
  const spawnKind: PowerupKind = equippedUnlocked
    ? profile.equippedPowerup
    : 'boost'

  useEffect(() => {
    if (finished || powerup || activeWordIndex < nextSpawnAtRef.current) return
    setPowerup(spawnKind)
    nextSpawnAtRef.current = activeWordIndex + randomSpawnGap()
  }, [activeWordIndex, finished, powerup, spawnKind])

  useEffect(() => {
    return () => {
      if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
    }
  }, [])

  // Boost force-commits the current word (see useTypingRace's skipWord). Shell targets whoever's
  // currently leading among the bots — pulling yourself back would be pointless — ignoring any
  // that have already finished, since there's nothing left to pull back.
  const usePowerup = useCallback(() => {
    if (!powerup || finished || locked) return
    if (powerup === 'boost') {
      skipWord()
      setLastEvent('Boost!')
    } else {
      const contenders = bots.filter((b) => !b.finished)
      if (contenders.length > 0) {
        const leader = contenders.reduce((a, b) =>
          b.progress > a.progress ? b : a,
        )
        hitBot(leader.id)
        setLastEvent(`Shelled ${leader.name}!`)
      }
    }
    setPowerup(null)
    if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
    eventTimeoutRef.current = setTimeout(() => setLastEvent(null), 1800)
  }, [powerup, finished, locked, skipWord, bots, hitBot])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Always swallow Tab during an active race, whether or not a powerup happens to be
      // available right now — letting its default focus-shift through even once yanks focus
      // off the hidden typing input, which then dumps subsequent keystrokes onto whatever
      // element Tab landed on instead.
      if (event.key !== 'Tab' || locked || finished) return
      event.preventDefault()
      if (powerup) usePowerup()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [powerup, locked, finished, usePowerup])

  const racers: Array<Racer> = [
    {
      id: 'you',
      name: 'You',
      progress,
      wpm,
      finished,
      isYou: true,
      color: profile.carColor,
      model: profile.carModel,
      underglow: profile.underglow,
      underglowColor: profile.underglowColor,
      trail: profile.trail,
    },
    ...bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      progress: bot.progress,
      wpm: bot.wpm,
      finished: bot.finished,
      color: bot.color,
      model: bot.model,
    })),
  ]

  const place = finished ? bots.filter((b) => b.finished).length + 1 : undefined

  // Records exactly once per race — `recordedRaceRef` tracks the sentence
  // this race was run on so a re-render after finishing (e.g. the gauges
  // ticking) never double-counts it in race history. The "new personal
  // best" check has to compare against the best *before* this race is
  // added, so it's computed in the same tick, ahead of the `addRace` call.
  const recordedRaceRef = useRef<string | null>(null)
  const [newBest, setNewBest] = useState(false)

  useEffect(() => {
    if (!finished || !place) return
    if (recordedRaceRef.current === text) return
    recordedRaceRef.current = text
    setNewBest(profile.stats.racesPlayed > 0 && wpm > profile.stats.bestWpm)
    profile.addRace({
      wpm,
      accuracy,
      placement: place,
      racerCount: bots.length + 1,
    })
  }, [
    finished,
    place,
    text,
    wpm,
    accuracy,
    bots.length,
    profile.addRace,
    profile.stats.bestWpm,
    profile.stats.racesPlayed,
  ])

  const analytics = (
    <div className="flex items-center gap-4">
      <Gauge label="wpm" value={wpm} max={WPM_GAUGE_MAX} size="lg" />
      <Gauge label="accuracy" value={accuracy} max={100} suffix="%" />
      <DigitalReadout label="time" value={formatTime(elapsedMs)} />
    </div>
  )

  return (
    <Card className="rise-in flex flex-col overflow-hidden rounded-t-none">
      <CardContent className="flex flex-col p-0">
        <RaceTrack
          racers={racers}
          countdown={countdown}
          phase={phase}
          className="flex-shrink-0"
        />

        <TypingWords
          spans={spans}
          typed={typed}
          activeWordIndex={activeWordIndex}
          finished={finished}
          locked={locked}
          errorSeq={errorSeq}
          onInputChange={handleInputChange}
          inputRef={inputRef}
          className="shrink-0"
          overlay={
            <>
              {finished && (
                <div className="countdown-overlay">
                  <Button
                    onClick={reset}
                    size="lg"
                    className="pointer-events-auto"
                  >
                    <RotateCcw />
                    Race Again
                  </Button>
                </div>
              )}
              {!finished && (powerup || lastEvent) && (
                <div className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
                  {powerup && (
                    <button
                      type="button"
                      onClick={usePowerup}
                      className="glass-chip pointer-events-auto flex animate-pulse items-center gap-1.5 rounded-full border-primary px-3 py-1.5 text-xs font-bold"
                    >
                      {(() => {
                        const Icon = POWERUP_ICONS[powerup]
                        return <Icon className="size-3.5 text-primary" />
                      })()}
                      {POWERUPS.find((p) => p.id === powerup)?.label} ready
                      <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold text-muted-foreground">
                        Tab
                      </kbd>
                    </button>
                  )}
                  {lastEvent && (
                    <span className="rounded-full bg-secondary/80 px-3 py-1 text-[0.7rem] font-semibold text-muted-foreground">
                      {lastEvent}
                    </span>
                  )}
                </div>
              )}
            </>
          }
        />
      </CardContent>

      {finished && <div className="glass-divider" />}

      {finished ? (
        <div className="flex flex-wrap items-center justify-between gap-5 bg-success/10 p-6">
          <div className="flex flex-wrap items-center gap-3">
            {place && place <= 3 ? (
              <Medal
                className="size-6 shrink-0"
                style={{ color: MEDAL_COLORS[place] }}
              />
            ) : (
              <Trophy className="size-6 shrink-0 text-success" />
            )}
            <div className="flex flex-col gap-1">
              <p className="text-base leading-none">
                Finished <strong>{place && ordinal(place)}</strong> of{' '}
                {bots.length + 1} in <strong>{formatTime(elapsedMs)}</strong>
              </p>
              {newBest && (
                <Badge variant="success" className="w-fit gap-1">
                  <Sparkles className="size-3" />
                  New personal best
                </Badge>
              )}
            </div>
          </div>
          <div className="race-footer-controls">{analytics}</div>
        </div>
      ) : null}
    </Card>
  )
}
