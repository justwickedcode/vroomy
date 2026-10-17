import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import WordStream from '#/components/guide/WordStream'
import Keyboard from '#/components/guide/Keyboard'
import RaceTrack from '#/components/typing/RaceTrack'
import { useWordStream } from '#/lib/guide/useWordStream'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { useKeepTypingFocus } from '#/lib/typing/useKeepTypingFocus'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/guide')({ component: GuidePage })

function Practice() {
  const { queue, typed, wpm, accuracy, handleInputChange, reset } =
    useWordStream()

  const inputRef = useRef<HTMLInputElement>(null)
  useKeepTypingFocus(inputRef, true)
  const profile = useProfile()
  const { user } = useCurrentUser()
  const currentWord = queue[0]
  const nextKey = !currentWord
    ? null
    : typed.length < currentWord.length
      ? currentWord[typed.length]
      : ' '

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
    // One connected panel, like a race: the track, the words, a dashboard console, then the
    // keyboard showing which key (and finger) comes next.
    <div className="rise-in px-corners grid gap-[2px] border-2 border-border bg-border">
      {/* The drill never ends, so there's no finish to drive toward: the car pulls off the line
          once you start typing and then cruises, with the road scrolling at your current WPM. */}
      <div className="flex flex-col">
        <RaceTrack
          racers={[
            {
              id: 'you',
              name: user?.name ?? 'You',
              progress: wpm > 0 ? 0.4 : 0,
              wpm,
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
        <WordStream
          queue={queue}
          typed={typed}
          onInputChange={handleInputChange}
          inputRef={inputRef}
        />
      </div>

      <div className="race-console">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-xl uppercase">Practice</span>
          <span className="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
            Endless drill
          </span>
        </div>
        <div className="race-lcd">
          <Lcd value={wpm} label="wpm" big />
          <Lcd value={`${accuracy}%`} label="acc" />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw />
            Restart
          </Button>
        </div>
      </div>

      <Keyboard activeKey={nextKey} />
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

function GuidePage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap">
        <Practice />
      </div>
    </main>
  )
}
