import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Gauge as GaugeIcon,
  Medal,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
} from 'lucide-react'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useBotRacers } from '#/lib/typing/useBotRacers'
import { useProfile } from '#/lib/profile/useProfile'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { cn, ordinal } from '#/lib/utils'
import RaceTrack from '#/components/typing/RaceTrack'
import Gauge from '#/components/typing/Gauge'
import TypingWords from '#/components/typing/TypingWords'
import type { Racer } from '#/components/typing/RaceTrack'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

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
    handleInputChange,
    reset,
  } = useTypingRace()

  const profile = useProfile()

  const bots = useBotRacers({
    raceKey: text,
    started,
    startedAt,
    textLength: text.length,
    playerFinished: finished,
    wpmRange: speedRange.wpm,
    count: 1,
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
    if (!locked) inputRef.current?.focus()
  }, [finished, locked])

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
        inputRef.current?.focus()
      }, 450)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

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

  return (
    <Card className="rise-in overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <p className="kicker mb-1">Solo vs AI</p>
          <Link
            to="/race/solo"
            className="text-sm font-semibold text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            change speed
          </Link>
        </div>
        <div className="flex gap-3">
          <Gauge
            icon={GaugeIcon}
            label="wpm"
            value={String(wpm)}
            progress={Math.min(wpm / WPM_GAUGE_MAX, 1)}
          />
          <Gauge
            icon={Target}
            label="accuracy"
            value={`${accuracy}%`}
            progress={accuracy / 100}
          />
          <Gauge
            icon={Timer}
            label="time"
            value={formatTime(elapsedMs)}
            progress={null}
          />
        </div>
      </CardHeader>
      <div className="glass-divider" />

      <CardContent className="pt-6">
        <div className="mb-6">
          <RaceTrack racers={racers} />
        </div>

        <TypingWords
          spans={spans}
          typed={typed}
          activeWordIndex={activeWordIndex}
          finished={finished}
          locked={locked}
          onInputChange={handleInputChange}
          inputRef={inputRef}
          className="mb-5"
          overlay={
            locked && (
              <div className="countdown-overlay">
                <span className="countdown-number" key={countdown}>
                  {countdown === 0 ? 'GO!' : countdown}
                </span>
              </div>
            )
          }
        />

        {finished ? (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
              'border-success/30 bg-success/10',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-2 text-sm">
                {place && place <= 3 ? (
                  <Medal
                    className="size-4"
                    style={{ color: MEDAL_COLORS[place] }}
                  />
                ) : (
                  <Trophy className="size-4 text-success" />
                )}
                Finished <strong>{place && ordinal(place)}</strong> of{' '}
                {bots.length + 1} in <strong>{formatTime(elapsedMs)}</strong> at{' '}
                <strong>{wpm} wpm</strong> with <strong>{accuracy}%</strong>{' '}
                accuracy.
              </p>
              {newBest && (
                <Badge variant="success" className="gap-1">
                  <Sparkles className="size-3" />
                  New personal best
                </Badge>
              )}
            </div>
            <Button onClick={reset}>
              <RotateCcw />
              Race Again
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="kicker">{started ? 'Racing…' : 'Get ready…'}</p>
            <Button variant="outline" onClick={reset} disabled={locked}>
              New Sentence
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
