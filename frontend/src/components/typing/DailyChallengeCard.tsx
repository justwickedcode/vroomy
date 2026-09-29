import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Flame,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import TypingWords from '#/components/typing/TypingWords'
import Gauge from '#/components/typing/Gauge'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useDailyChallenge } from '#/lib/daily/useDailyChallenge'
import { getDailySentence } from '#/lib/typing/sentences'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'

const WPM_GAUGE_MAX = 130
// Matches TypingRace's own solo countdown length — long enough to get fingers on the keys,
// short enough that clicking Start doesn't feel like a wait.
const COUNTDOWN_START = 3

// entry.date is "YYYY-MM-DD" (local, see dateKey in sentences.ts) — parsed as y/m/d components
// rather than `new Date(entry.date)`, which treats a bare date string as UTC midnight and can
// display as the previous day in negative UTC-offset timezones.
function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

// Lives directly on the dashboard rather than its own /daily-challenge page — one less place to
// have to navigate to for something meant to be a quick daily habit.
export default function DailyChallengeCard() {
  const { hydrated, result, complete, history, bestWpm, streak } =
    useDailyChallenge()
  const {
    spans,
    typed,
    activeWordIndex,
    finished,
    wpm,
    accuracy,
    handleInputChange,
    start,
    reset,
  } = useTypingRace(getDailySentence)

  const inputRef = useRef<HTMLInputElement>(null)
  const profile = useProfile()

  // Unlike TypingRace (which auto-starts its countdown the instant a fresh sentence loads, to
  // simulate every player in a room starting together), the daily challenge is a single solo
  // attempt at one passage — there's nothing to synchronize with, so it waits for an explicit
  // Start click instead of firing on its own.
  const [phase, setPhase] = useState<'idle' | 'counting' | 'ready'>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  // Bumped by "Try again" so the recording effect below fires again for a genuinely new attempt
  // — recordedAttemptRef alone can't tell two attempts apart since the passage (and therefore
  // `finished` going true) is otherwise identical every time.
  const [attempt, setAttempt] = useState(0)
  const [newBest, setNewBest] = useState(false)
  const recordedAttemptRef = useRef<number | null>(null)

  const locked = phase !== 'ready'

  useEffect(() => {
    if (locked || finished) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [locked, finished])

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

  // The "new best" check has to compare against bestWpm *before* this run — complete() below
  // may raise it in the same tick, but this effect already captured the prior value from its
  // own closure before that happens.
  useEffect(() => {
    if (!finished || recordedAttemptRef.current === attempt) return
    recordedAttemptRef.current = attempt
    setNewBest(wpm > bestWpm)
    complete(wpm, accuracy)
    profile.addRace({ wpm, accuracy, placement: 1, racerCount: 1 })
  }, [finished, wpm, accuracy, complete, attempt, bestWpm, profile.addRace])

  function handleStart() {
    setCountdown(COUNTDOWN_START)
    setPhase('counting')
  }

  function handleTryAgain() {
    reset()
    setNewBest(false)
    setAttempt((a) => a + 1)
    setPhase('idle')
  }

  return (
    <Card className="rise-in overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <p className="kicker">Daily challenge</p>
          {hydrated && streak > 0 && (
            <Badge variant="outline" className="gap-1">
              <Flame className="size-3" />
              {streak} day{streak === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <div className="flex gap-3">
          <Gauge label="wpm" value={wpm} max={WPM_GAUGE_MAX} />
          <Gauge label="accuracy" value={accuracy} max={100} suffix="%" />
        </div>
      </CardHeader>
      <div className="glass-divider" />

      <CardContent className="pt-6">
        {hydrated && bestWpm > 0 && !finished && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
            <Trophy className="size-4 shrink-0 text-primary" />
            Your best daily run:{' '}
            <strong className="text-foreground">{bestWpm} wpm</strong>.
            {result && ` Today so far: ${result.wpm} wpm.`} Beat it below.
          </div>
        )}

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
            finished ? (
              <div className="countdown-overlay">
                <Button
                  onClick={handleTryAgain}
                  size="lg"
                  className="pointer-events-auto"
                >
                  <RotateCcw />
                  Try again
                </Button>
              </div>
            ) : phase === 'idle' ? (
              <div className="countdown-overlay">
                <Button
                  onClick={handleStart}
                  size="lg"
                  className="pointer-events-auto"
                >
                  <Play />
                  Start
                </Button>
              </div>
            ) : phase === 'counting' ? (
              <div className="race-countdown-overlay" aria-live="assertive">
                <span
                  key={countdown}
                  className={cn(
                    'race-countdown-number',
                    countdown === 0 && 'race-countdown-number--go',
                  )}
                >
                  {countdown === 0 ? 'GO!' : countdown}
                </span>
              </div>
            ) : null
          }
        />

        {finished ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
            <Trophy className="size-6 shrink-0 text-success" />
            <div className="flex flex-col gap-1">
              <p className="text-sm leading-none">
                <strong>{wpm} wpm</strong> at <strong>{accuracy}%</strong>{' '}
                accuracy. Same passage for everyone today — come back
                tomorrow for a new one.
              </p>
              {newBest && (
                <Badge variant="success" className="w-fit gap-1">
                  <Sparkles className="size-3" />
                  New daily best
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="kicker">
            {phase === 'idle'
              ? "Hit start when you're ready"
              : 'Type the passage above'}
          </p>
        )}
      </CardContent>

      {hydrated && history.length > 0 && (
        <>
          <div className="glass-divider" />
          <CardHeader className="py-5">
            <p className="kicker">History</p>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <div className="flex flex-col gap-1">
              {history.map((entry) => (
                <div
                  key={entry.date}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {formatHistoryDate(entry.date)}
                  </span>
                  <span className="flex items-center gap-3 font-mono">
                    <span
                      className={cn(
                        'font-bold',
                        entry.wpm >= bestWpm && 'text-primary',
                      )}
                    >
                      {entry.wpm} wpm
                    </span>
                    <span className="text-muted-foreground">
                      {entry.accuracy}% acc
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </>
      )}
    </Card>
  )
}
