import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Gauge as GaugeIcon, RotateCcw, Target } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import WordStream from '#/components/guide/WordStream'
import Gauge from '#/components/typing/Gauge'
import Keyboard from '#/components/guide/Keyboard'
import { useWordStream } from '#/lib/guide/useWordStream'

export const Route = createFileRoute('/guide')({ component: GuidePage })

const WPM_GAUGE_MAX = 130

function Practice() {
  const { queue, typed, wpm, accuracy, handleInputChange, reset } =
    useWordStream()

  const inputRef = useRef<HTMLInputElement>(null)
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
        </div>
      </CardHeader>
      <div className="glass-divider" />

      <CardContent className="pt-6">
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
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <h1 className="rise-in mb-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Type faster.
        </h1>

        <Practice />
      </div>
    </main>
  )
}
