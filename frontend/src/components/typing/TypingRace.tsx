import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Gauge as GaugeIcon,
  RotateCcw,
  Target,
  Timer,
  Trophy,
} from 'lucide-react'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useBotRacers, SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { cn } from '#/lib/utils'
import RaceTrack from '#/components/typing/RaceTrack'
import RaceSetup from '#/components/typing/RaceSetup'
import Gauge from '#/components/typing/Gauge'
import type { Racer } from '#/components/typing/RaceTrack'
import type { SpeedRange } from '#/lib/typing/useBotRacers'
import type { WordSpan } from '#/lib/typing/useTypingRace'

const WPM_GAUGE_MAX = 130

const RACE_COUNTDOWN_START = 10

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

function ordinal(n: number) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

type WordState = 'pending' | 'active' | 'correct'

function Word({
  span,
  typed,
  state,
}: {
  span: WordSpan
  typed: string
  state: WordState
}) {
  if (state === 'active') {
    const chars = span.word.split('')
    const caretPos = typed.length - span.start
    const overflow = typed.length > span.end ? typed.slice(span.end) : ''
    return (
      <span className="race-word">
        {chars.map((char, i) => {
          const index = span.start + i
          const className =
            index >= typed.length
              ? 'race-char-pending'
              : typed[index] === char
                ? 'race-char-correct'
                : 'race-char-incorrect'
          return (
            <Fragment key={i}>
              {i === caretPos && <span data-caret-marker="" />}
              <span className={className}>{char}</span>
            </Fragment>
          )
        })}
        {overflow.split('').map((char, i) => (
          <span key={`overflow-${i}`} className="race-char-incorrect">
            {char}
          </span>
        ))}
        {caretPos >= chars.length && <span data-caret-marker="" />}
      </span>
    )
  }

  return <span className={`race-word race-word-${state}`}>{span.word}</span>
}

export default function TypingRace() {
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

  const [opponent, setOpponent] = useState<SpeedRange | null>(null)

  const bots = useBotRacers({
    raceKey: text,
    started,
    startedAt,
    textLength: text.length,
    playerFinished: finished,
    wpmRange: opponent?.wpm ?? SPEED_RANGES[1].wpm,
    count: opponent ? 1 : 0,
  })

  const inputRef = useRef<HTMLInputElement>(null)
  const wordsRef = useRef<HTMLButtonElement>(null)
  const [caretPos, setCaretPos] = useState<{ x: number; y: number } | null>(
    null,
  )
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
    if (!opponent) return
    setPhase('waiting')
    setCountdown(RACE_COUNTDOWN_START)
    const t = setTimeout(() => setPhase('counting'), 600)
    return () => clearTimeout(t)
  }, [opponent, text])

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

  useLayoutEffect(() => {
    const container = wordsRef.current
    const marker = container?.querySelector('[data-caret-marker]')
    if (!container || !marker) {
      setCaretPos(null)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    setCaretPos({
      x: markerRect.left - containerRect.left,
      y: markerRect.top - containerRect.top,
    })
  }, [typed, activeWordIndex, finished])

  const racers: Array<Racer> = [
    { id: 'you', name: 'You', progress, wpm, finished, isYou: true },
    ...bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      progress: bot.progress,
      wpm: bot.wpm,
      finished: bot.finished,
      color: bot.color,
    })),
  ]

  const place = finished ? bots.filter((b) => b.finished).length + 1 : undefined

  if (!opponent) {
    return (
      <Card className="rise-in overflow-hidden">
        <div className="checkered-strip" />
        <CardHeader className="py-6">
          <p className="kicker mb-1">Vroomy</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Type fast. Win the race.
          </h1>
        </CardHeader>
        <div className="glass-divider" />
        <CardContent>
          <RaceSetup onStart={setOpponent} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rise-in overflow-hidden">
      <div className="checkered-strip" />

      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <p className="kicker mb-1">
            Vroomy · Solo vs AI ·{' '}
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              onClick={() => setOpponent(null)}
            >
              change speed
            </button>
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Type fast. Win the race.
          </h1>
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

        <button
          ref={wordsRef}
          type="button"
          className="race-words relative mb-5 block w-full cursor-text rounded-lg p-5 text-left"
          onClick={() => {
            if (!locked && !finished) inputRef.current?.focus()
          }}
        >
          {spans.map((span, index) => {
            // Words are only ever committed once typed exactly right, so
            // anything behind the active word (or the whole sentence, once
            // finished) is always correct — no incorrect-and-locked state.
            const state: WordState =
              index === activeWordIndex && !finished
                ? 'active'
                : index < activeWordIndex || finished
                  ? 'correct'
                  : 'pending'
            return <Word key={index} span={span} typed={typed} state={state} />
          })}
          {caretPos && !finished && !locked && (
            <span
              className="race-caret"
              style={{
                transform: `translate(${caretPos.x}px, ${caretPos.y}px)`,
              }}
            />
          )}
          {locked && (
            <div className="countdown-overlay">
              <span className="countdown-number" key={countdown}>
                {countdown === 0 ? 'GO!' : countdown}
              </span>
            </div>
          )}
        </button>

        {finished ? (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
              'border-success/30 bg-success/10',
            )}
          >
            <p className="flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-success" />
              Finished <strong>{place && ordinal(place)}</strong> of{' '}
              {bots.length + 1} in <strong>{formatTime(elapsedMs)}</strong> at{' '}
              <strong>{wpm} wpm</strong> with <strong>{accuracy}%</strong>{' '}
              accuracy.
            </p>
            <Button onClick={reset}>
              <RotateCcw />
              Race Again
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={locked}
              className="sr-only"
              value={typed}
              onChange={(event) => handleInputChange(event.target.value)}
              aria-label="Type the passage"
            />
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
