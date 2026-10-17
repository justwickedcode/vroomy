import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import WordStream from '#/components/guide/WordStream'
import RaceTrack from '#/components/typing/RaceTrack'
import { useWordStream } from '#/lib/guide/useWordStream'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { useKeepTypingFocus } from '#/lib/typing/useKeepTypingFocus'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/practice')({ component: PracticePage })

// A classic typing test: one minute, then your WPM.
const TEST_MS = 60000

// 0:59, 0:05...
function formatClock(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function Practice() {
  const {
    queue,
    typed,
    completed,
    wpm,
    accuracy,
    started,
    finished,
    timeLeftMs,
    handleInputChange,
    reset,
  } = useWordStream(TEST_MS)

  const inputRef = useRef<HTMLInputElement>(null)
  useKeepTypingFocus(inputRef, !finished)
  const profile = useProfile()
  const { user } = useCurrentUser()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleReset(event: { currentTarget: HTMLButtonElement }) {
    reset()
    // Buttons keep keyboard focus after a click, and a focused button
    // treats Space as "activate me" — so typing the space between words
    // would silently re-trigger "Restart". Hand focus straight back to
    // the (now-hidden) typing input instead.
    event.currentTarget.blur()
    inputRef.current?.focus()
  }

  return (
    // One connected panel, like a race: the track, the words, then a dashboard console.
    <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
      {/* No finish line to drive toward: the car pulls off once you start typing and cruises,
          with the road scrolling at your current WPM, until the minute is up. */}
      <div className="flex flex-col">
        <RaceTrack
          racers={[
            {
              id: 'you',
              name: user?.name ?? 'You',
              progress: 0.25,
              // Time's up: the car rolls to a stop.
              wpm: finished ? 0 : wpm,
              isYou: true,
              model: profile.carModel,
              underglow: profile.underglow,
              underglowColor: profile.underglowColor,
              trail: profile.trail,
            },
          ]}
          phase="ready"
          finishLine={false}
          epic
        />
        <div className="relative">
          <WordStream
            queue={queue}
            typed={typed}
            onInputChange={handleInputChange}
            inputRef={inputRef}
          />
          {/* Time's up: the result, in place of the words. */}
          {finished && (
            <div className="race-results">
              <div className="flex flex-col gap-1">
                <p className="font-display text-6xl leading-none text-signal [text-shadow:4px_4px_0_rgb(0_0_0/0.5)]">
                  {wpm}
                  <span className="ml-2 text-2xl text-[#8a7ca3]">wpm</span>
                </p>
                <p className="font-mono text-xs text-[#8a7ca3]">
                  1 minute · {accuracy}% accuracy · {completed} words
                </p>
              </div>
              <span />
              <Button onClick={handleReset}>
                <RotateCcw />
                Again
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="race-console">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-xl uppercase">Practice</span>
          <span className="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
            {finished ? 'Done' : started ? 'Go go go' : 'Starts when you type'}
          </span>
        </div>
        <div className="race-lcd">
          <Lcd value={formatClock(timeLeftMs)} label="time" big />
          <Lcd value={wpm} label="wpm" />
          <Lcd value={`${accuracy}%`} label="acc" />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw />
            Restart
          </Button>
        </div>
      </div>
    </div>
  )
}

function Lcd({
  value,
  label,
  big,
}: {
  value: string | number
  label: string
  big?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-1.5">
      <span className={cn('race-lcd-value', big && 'text-3xl')}>{value}</span>
      <span className="race-lcd-label">{label}</span>
    </div>
  )
}

function PracticePage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap">
        <Practice />
      </div>
    </main>
  )
}
