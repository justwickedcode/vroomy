import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import WordStream from '#/components/guide/WordStream'
import Gauge from '#/components/typing/Gauge'
import Keyboard from '#/components/guide/Keyboard'
import RaceTrack from '#/components/typing/RaceTrack'
import { useWordStream } from '#/lib/guide/useWordStream'
import { useProfile } from '#/lib/profile/useProfile'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'

export const Route = createFileRoute('/guide')({ component: GuidePage })

const WPM_GAUGE_MAX = 130

function Practice() {
  const { queue, typed, wpm, accuracy, handleInputChange, reset } =
    useWordStream()

  const inputRef = useRef<HTMLInputElement>(null)
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
    <Card className="rise-in overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-6">
        <p className="kicker">Practice</p>
        <div className="flex gap-3">
          <Gauge label="wpm" value={wpm} max={WPM_GAUGE_MAX} />
          <Gauge label="accuracy" value={accuracy} max={100} suffix="%" />
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {/* The drill never ends, so there's no finish to drive toward: the car pulls off the line
            once you start typing and then cruises, with the road scrolling at your current WPM. */}
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
          className="mb-4 overflow-hidden rounded-lg"
        />

        <WordStream
          queue={queue}
          typed={typed}
          onInputChange={handleInputChange}
          inputRef={inputRef}
        />

        <div className="mt-6 mb-6 flex items-center justify-between">
          <p className="kicker">Type the highlighted key</p>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw />
            Restart
          </Button>
        </div>

        <Keyboard activeKey={nextKey} />
      </CardContent>
    </Card>
  )
}

function GuidePage() {
  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <Practice />
      </div>
    </main>
  )
}
