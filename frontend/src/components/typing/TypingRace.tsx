import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PlayCircle, RotateCcw } from '#/components/ui/icons'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useBotRacers } from '#/lib/typing/useBotRacers'
import { useProfile } from '#/lib/profile/useProfile'
import { Button } from '#/components/ui/button'
import { powerupDef } from '#/lib/powerups'
import { useSoloPowerups } from '#/lib/typing/useSoloPowerups'
import InkSplats from '#/components/typing/InkSplats'
import { cn } from '#/lib/utils'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import RaceConsole from '#/components/typing/RaceConsole'
import RaceResults from '#/components/typing/RaceResults'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'
import type { Racer } from '#/components/typing/RaceTrack'
import type { SpeedRange } from '#/lib/typing/useBotRacers'
import { useKeepTypingFocus } from '#/lib/typing/useKeepTypingFocus'

// Solo vs AI has nobody else to wait on, so the countdown just needs to be
// long enough to get fingers on the keys — not a real multiplayer-room wait.
const RACE_COUNTDOWN_START = 3

export default function TypingRace({
  speedRange,
  chaos = false,
}: {
  speedRange: SpeedRange
  // Chaos mode: item roulette for everyone, and the bots fight back.
  chaos?: boolean
}) {
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

  const { bots, hitBot, delayBot } = useBotRacers({
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
  useKeepTypingFocus(inputRef, !locked && !finished)

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

  // ── Abilities ────────────────────────────────────────────────────
  // Classic: the equipped one, once per race. Chaos: an item roulette for you and the bots,
  // who fire theirs at you (see useSoloPowerups).
  const powers = useSoloPowerups({
    chaos,
    equipped: profile.equippedPowerup,
    raceKey: text,
    startedAt,
    finished,
    locked,
    progress,
    textLength: text.length,
    bots,
    hitBot,
    delayBot,
    skipWord,
  })
  const { fire, slot } = powers

  // A hit that freezes you swallows keystrokes until it wears off.
  const onInputChange = (value: string) => {
    if (powers.frozen) return
    handleInputChange(value)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Always swallow Tab during an active race, whether or not an ability happens to be
      // available right now — letting its default focus-shift through even once yanks focus
      // off the hidden typing input, which then dumps subsequent keystrokes onto whatever
      // element Tab landed on instead.
      if (event.key !== 'Tab' || locked || finished) return
      event.preventDefault()
      if (slot) fire()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [slot, locked, finished, fire])

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
      ghost: powers.ghostYou,
    },
    ...bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      progress: bot.progress,
      wpm: bot.wpm,
      finished: bot.finished,
      model: bot.model,
      ghost: powers.ghostBots.has(bot.id),
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

  // The item box shows whatever's in your slot (or spinning in it); in classic, the equipped
  // ability stays on show, spent or not, so the box never pops in and out.
  const boxKind = powers.face ?? (chaos ? null : profile.equippedPowerup)

  return (
    // One connected panel: the track, the words, a slim status bar, then the results.
    <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
      <div
        className={cn(
          'flex flex-col',
          powers.screen && `race-hit race-hit--${powers.screen.screen}`,
          powers.frozen && 'race-hit--frozen',
        )}
      >
        <RaceTrack
          racers={racers}
          countdown={countdown}
          phase={phase}
          epic
          effect={powers.effect}
          className="flex-shrink-0"
        />

        <TypingWords
          spans={spans}
          typed={typed}
          activeWordIndex={activeWordIndex}
          finished={finished}
          locked={locked}
          errorSeq={errorSeq}
          onInputChange={onInputChange}
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
              {!finished && powers.screen?.screen === 'ink' && (
                <InkSplats key={powers.screen.key} />
              )}
              {!finished && powers.frozen && (
                <span className="race-frozen-tag">Frozen</span>
              )}
              {!finished && powers.event && (
                <div className="pointer-events-none absolute top-3 right-3 z-10">
                  <span className="race-announcer">{powers.event}</span>
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
        powerup={{
          kind: boxKind,
          label: boxKind ? powerupDef(boxKind).label : 'Item box',
          detail: boxKind ? powerupDef(boxKind).detail : '',
          ready: Boolean(slot),
          rolling: powers.rolling,
          charge: chaos ? powers.charge : undefined,
          canFire: Boolean(slot) && !locked && !finished,
          onFire: fire,
        }}
        {...credit}
      />
    </div>
  )
}
