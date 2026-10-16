import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PlayCircle, RotateCcw } from '#/components/ui/icons'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useBotRacers } from '#/lib/typing/useBotRacers'
import { useProfile } from '#/lib/profile/useProfile'
import { Button } from '#/components/ui/button'
import { POWERUPS } from '#/lib/powerups'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import RaceConsole from '#/components/typing/RaceConsole'
import RaceResults from '#/components/typing/RaceResults'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'
import type { Racer, RaceEffect } from '#/components/typing/RaceTrack'
import type { SpeedRange } from '#/lib/typing/useBotRacers'
import type { PowerupKind } from '#/lib/powerups'

// How far the Nuke throws every bot back — the strongest powerup, priced to match (see shop).
const NUKE_WORDS = 3

// Solo vs AI has nobody else to wait on, so the countdown just needs to be
// long enough to get fingers on the keys — not a real multiplayer-room wait.
const RACE_COUNTDOWN_START = 3

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
    getReplay,
    credit,
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
  // One per race: the equipped powerup (see Garage) is ready from GO and can be fired at any
  // moment with Tab, then it's spent until the next race. Picking the moment is the skill.
  const [powerupUsed, setPowerupUsed] = useState(false)
  const powerup: PowerupKind | null =
    powerupUsed || finished ? null : profile.equippedPowerup
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  // Drives the one-shot activation animation (RaceTrack's PowerupBurst/PowerupImpact/emp-flash)
  // — a plain object, not a boolean, so RaceTrack knows which kind/target to render; `key` is
  // bumped on every use (see triggerEffect) so using the same kind twice in a row still remounts
  // and replays instead of no-op'ing on unchanged props.
  const [activeEffect, setActiveEffect] = useState<RaceEffect | null>(null)
  const eventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const effectKeyRef = useRef(0)
  const effectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerEffect = useCallback(
    (effect: { kind: PowerupKind; targetId?: string }) => {
      effectKeyRef.current += 1
      setActiveEffect({ ...effect, key: effectKeyRef.current })
      if (effectTimeoutRef.current) clearTimeout(effectTimeoutRef.current)
      effectTimeoutRef.current = setTimeout(() => setActiveEffect(null), 650)
    },
    [],
  )

  // A new passage is a new race, with a fresh powerup.
  useEffect(() => {
    setPowerupUsed(false)
    setLastEvent(null)
  }, [text])

  useEffect(() => {
    return () => {
      if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
      if (effectTimeoutRef.current) clearTimeout(effectTimeoutRef.current)
    }
  }, [])

  // Boost/nitro force-commit word(s) (see useTypingRace's skipWord — nitro just passes a count of
  // 2). Shell hits whoever's currently leading; magnet hits whoever's closest ahead of the player
  // specifically (your direct rival, not necessarily 1st overall — falls back to the leader if
  // you're already out front); EMP hits every bot still racing at once. All four bot-targeting
  // kinds ignore anyone already finished, since there's nothing left to pull back.
  const usePowerup = useCallback(() => {
    if (!powerup || finished || locked) return
    const contenders = bots.filter((b) => !b.finished)

    if (powerup === 'boost') {
      skipWord()
      setLastEvent('Boost!')
      triggerEffect({ kind: 'boost' })
    } else if (powerup === 'nitro') {
      skipWord(2)
      setLastEvent('Nitro!')
      triggerEffect({ kind: 'nitro' })
    } else if (powerup === 'shell') {
      if (contenders.length > 0) {
        const leader = contenders.reduce((a, b) =>
          b.progress > a.progress ? b : a,
        )
        hitBot(leader.id)
        setLastEvent(`Shelled ${leader.name}!`)
        triggerEffect({ kind: 'shell', targetId: leader.id })
      }
    } else if (powerup === 'emp') {
      if (contenders.length > 0) {
        for (const bot of contenders) hitBot(bot.id)
        setLastEvent('EMP!')
        triggerEffect({ kind: 'emp' })
      }
    } else if (powerup === 'nuke') {
      if (contenders.length > 0) {
        for (const bot of contenders) hitBot(bot.id, NUKE_WORDS)
        setLastEvent('Nuked!')
        triggerEffect({ kind: 'nuke' })
      }
    } else {
      const ahead = contenders.filter((b) => b.progress > progress)
      const rival =
        ahead.length > 0
          ? ahead.reduce((a, b) => (b.progress < a.progress ? b : a))
          : contenders.length > 0
            ? contenders.reduce((a, b) => (b.progress > a.progress ? b : a))
            : undefined
      if (rival) {
        hitBot(rival.id)
        setLastEvent(`Yanked back ${rival.name}!`)
        triggerEffect({ kind: 'magnet', targetId: rival.id })
      }
    }

    setPowerupUsed(true)
    if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current)
    eventTimeoutRef.current = setTimeout(() => setLastEvent(null), 1800)
  }, [
    powerup,
    finished,
    locked,
    skipWord,
    bots,
    hitBot,
    progress,
    triggerEffect,
  ])

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
  // The just-finished race's replay, once it's saved — for the "Watch replay" button.
  const [replayId, setReplayId] = useState<string | null>(null)
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null)
  const [unlocks, setUnlocks] = useState<Array<UnlockedAchievement>>([])

  useEffect(() => {
    if (!finished || !place) return
    if (recordedRaceRef.current === text) return
    recordedRaceRef.current = text
    setNewBest(profile.stats.racesPlayed > 0 && wpm > profile.stats.bestWpm)
    setReplayId(null)
    setCoinsEarned(null)
    setUnlocks([])
    const raceText = text
    void profile
      .addRace({
        wpm,
        accuracy,
        placement: place,
        racerCount: bots.length + 1,
        mode: 'solo',
        replay: getReplay(),
      })
      .then((saved) => {
        // Ignore a save that lands after the player already started the next race.
        if (recordedRaceRef.current !== raceText) return
        setReplayId(saved.replayId)
        setCoinsEarned(saved.coinsEarned)
        setUnlocks(saved.achievements)
      })
  }, [
    finished,
    place,
    text,
    wpm,
    accuracy,
    bots.length,
    profile.addRace,
    getReplay,
    profile.stats.bestWpm,
    profile.stats.racesPlayed,
  ])

  // Shown for the whole race, ready or spent, so the chip never pops in and out.
  const equippedDef = POWERUPS.find((p) => p.id === profile.equippedPowerup)

  return (
    // One connected panel: the track, the words, a slim status bar, then the results.
    <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
      <div className="flex flex-col">
        <RaceTrack
          racers={racers}
          countdown={countdown}
          phase={phase}
          epic
          effect={activeEffect}
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
                <RaceResults
                  place={place ?? null}
                  racerCount={bots.length + 1}
                  elapsedMs={elapsedMs}
                  coinsEarned={coinsEarned}
                  newBest={newBest}
                  unlocks={unlocks}
                  actions={
                    <>
                      <Button onClick={reset}>
                        <RotateCcw />
                        Race again
                      </Button>
                      {replayId && (
                        <Button asChild variant="outline">
                          <Link to="/replays/$replayId" params={{ replayId }}>
                            <PlayCircle />
                            Replay
                          </Link>
                        </Button>
                      )}
                    </>
                  }
                />
              )}
              {!finished && lastEvent && (
                <div className="pointer-events-none absolute top-3 right-3 z-10">
                  <span className="px-corners pixel-text bg-secondary/80 px-3 py-1 text-[0.7rem] font-semibold text-muted-foreground">
                    {lastEvent}
                  </span>
                </div>
              )}
            </>
          }
        />
      </div>
      <RaceConsole
        wpm={wpm}
        accuracy={accuracy}
        elapsedMs={elapsedMs}
        powerup={
          equippedDef && {
            kind: profile.equippedPowerup,
            label: equippedDef.label,
            detail: equippedDef.detail,
            ready: Boolean(powerup),
            canFire: Boolean(powerup) && !locked && !finished,
            onFire: usePowerup,
          }
        }
        {...credit}
      />
    </div>
  )
}
