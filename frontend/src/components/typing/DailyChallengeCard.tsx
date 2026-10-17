import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CalendarDays,
  Flame,
  Play,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Trophy,
} from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import TypingWords from '#/components/typing/TypingWords'
import RaceTrack from '#/components/typing/RaceTrack'
import RaceConsole from '#/components/typing/RaceConsole'
import { PlaySection, StartButton } from '#/components/play/PlayKit'
import Coins from '#/components/ui/Coins'
import AchievementUnlocks from '#/components/ui/AchievementUnlocks'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useDailyChallenge } from '#/lib/daily/useDailyChallenge'
import { getDailyQuote, todayKey } from '#/lib/typing/sentences'
import { useLeaderboard } from '#/lib/social/useLeaderboard'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import LeaderboardTable from '#/components/social/LeaderboardTable'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import { useKeepTypingFocus } from '#/lib/typing/useKeepTypingFocus'

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
    progress,
    elapsedMs,
    handleInputChange,
    start,
    reset,
    getReplay,
    credit,
  } = useTypingRace(getDailyQuote)
  // Keyed on the local date, so the board rolls over at the same midnight the passage does.
  const leaderboard = useLeaderboard({ board: 'daily', date: todayKey() })
  const { user } = useCurrentUser()

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
  // This attempt's replay, once saved — for the "Watch replay" button.
  const [replayId, setReplayId] = useState<string | null>(null)
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null)
  const [unlocks, setUnlocks] = useState<Array<UnlockedAchievement>>([])
  const recordedAttemptRef = useRef<number | null>(null)
  const latestAttemptRef = useRef(attempt)
  latestAttemptRef.current = attempt

  const locked = phase !== 'ready'
  useKeepTypingFocus(inputRef, !locked && !finished)

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
    void profile
      .addRace({
        wpm,
        accuracy,
        placement: 1,
        racerCount: 1,
        mode: 'daily',
        dailyDate: todayKey(),
        replay: getReplay(),
      })
      .then((saved) => {
        // Ignore a save that lands after the player already hit "Try again".
        if (latestAttemptRef.current !== attempt) return
        setReplayId(saved.replayId)
        setCoinsEarned(saved.coinsEarned)
        setUnlocks(saved.achievements)
      })
  }, [
    finished,
    wpm,
    accuracy,
    complete,
    attempt,
    bestWpm,
    profile.addRace,
    getReplay,
  ])

  function handleStart() {
    setCountdown(COUNTDOWN_START)
    setPhase('counting')
  }

  function handleTryAgain() {
    reset()
    setNewBest(false)
    setReplayId(null)
    setCoinsEarned(null)
    setUnlocks([])
    setAttempt((a) => a + 1)
    setPhase('idle')
  }

  return (
    // One connected panel, like a race: today's strip, the track and words, the dash console,
    // then today's board and your history.
    <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card px-4 py-3">
        <CalendarDays className="size-6" />
        <span className="font-display text-xl uppercase">Daily challenge</span>
        {hydrated && streak > 0 && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-signal">
            <Flame className="size-4" />
            {streak} day{streak === 1 ? '' : 's'}
          </span>
        )}
        {hydrated && bestWpm > 0 && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Trophy className="size-4" />
            Best <span className="text-foreground">{bestWpm} wpm</span>
            {result && <> · today {result.wpm}</>}
          </span>
        )}
      </div>

      <div className="flex flex-col">
        <RaceTrack
          racers={[
            {
              id: 'you',
              name: user?.name ?? 'You',
              progress,
              wpm,
              finished,
              isYou: true,
              model: profile.carModel,
              underglow: profile.underglow,
              underglowColor: profile.underglowColor,
              trail: profile.trail,
            },
          ]}
          phase="ready"
          epic
        />
        <TypingWords
          spans={spans}
          typed={typed}
          activeWordIndex={activeWordIndex}
          finished={finished}
          locked={locked}
          onInputChange={handleInputChange}
          inputRef={inputRef}
          overlay={
            finished ? (
              <div className="race-results">
                <div className="flex flex-col gap-1">
                  <p className="font-display text-6xl leading-none text-signal [text-shadow:4px_4px_0_rgb(0_0_0/0.5)]">
                    {wpm}
                    <span className="ml-2 text-2xl text-[#8a7ca3]">wpm</span>
                  </p>
                  <p className="font-mono text-xs text-[#8a7ca3]">
                    {accuracy}% accuracy
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-sm">
                  {coinsEarned !== null && (
                    <Coins
                      amount={coinsEarned}
                      prefix="+"
                      className="font-bold text-signal"
                    />
                  )}
                  {newBest && (
                    <span className="flex items-center gap-2 font-semibold">
                      <Sparkles className="size-4" />
                      New daily best
                    </span>
                  )}
                  <AchievementUnlocks unlocked={unlocks} />
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={handleTryAgain}>
                    <RotateCcw />
                    Try again
                  </Button>
                  {replayId && (
                    <Button asChild variant="outline">
                      <Link to="/replays/$replayId" params={{ replayId }}>
                        <PlayCircle />
                        Replay
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : phase === 'idle' ? (
              <div className="countdown-overlay">
                <StartButton
                  onClick={handleStart}
                  className="pointer-events-auto w-auto px-10"
                >
                  <Play />
                  Start
                </StartButton>
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
      </div>

      <RaceConsole
        wpm={wpm}
        accuracy={accuracy}
        elapsedMs={elapsedMs}
        {...credit}
      />

      {leaderboard.data && (
        <PlaySection
          label="Today's top racers"
          aside={
            <Link
              to="/leaderboards"
              search={{ board: 'daily' }}
              className="text-xs font-semibold text-muted-foreground hover:text-primary"
            >
              Full board
            </Link>
          }
        >
          <LeaderboardTable
            board={leaderboard.data}
            compact
            limit={5}
            emptyText="No runs yet"
          />
        </PlaySection>
      )}

      {hydrated && history.length > 0 && (
        <PlaySection label="History">
          <div className="flex flex-col">
            {history.map((entry) => (
              <div
                key={entry.date}
                className="flex items-center justify-between py-1.5 text-sm"
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
        </PlaySection>
      )}
    </div>
  )
}
