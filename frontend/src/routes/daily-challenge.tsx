import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import TypingWords from '#/components/typing/TypingWords'
import Gauge from '#/components/typing/Gauge'
import { useTypingRace } from '#/lib/typing/useTypingRace'
import { useDailyChallenge } from '#/lib/daily/useDailyChallenge'
import { getDailySentence } from '#/lib/typing/sentences'
import { useProfile } from '#/lib/profile/useProfile'

export const Route = createFileRoute('/daily-challenge')({
  component: DailyChallengePage,
})

const WPM_GAUGE_MAX = 130

function DailyChallengePage() {
  const { hydrated, result, complete } = useDailyChallenge()
  const {
    spans,
    typed,
    activeWordIndex,
    finished,
    wpm,
    accuracy,
    handleInputChange,
  } = useTypingRace(getDailySentence)

  const inputRef = useRef<HTMLInputElement>(null)
  const profile = useProfile()
  const recordedRef = useRef(false)

  useEffect(() => {
    if (!finished || recordedRef.current) return
    recordedRef.current = true
    complete(wpm, accuracy)
    profile.addRace({ wpm, accuracy, placement: 1, racerCount: 1 })
  }, [finished, wpm, accuracy, complete])

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <Card className="rise-in overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-6">
            <p className="kicker">Daily challenge</p>
            <div className="flex gap-3">
              <Gauge label="wpm" value={wpm} max={WPM_GAUGE_MAX} />
              <Gauge label="accuracy" value={accuracy} max={100} suffix="%" />
            </div>
          </CardHeader>
          <div className="glass-divider" />

          <CardContent className="pt-6">
            {hydrated && result && !finished && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                <CalendarDays className="size-4 shrink-0 text-primary" />
                Today&apos;s run:{' '}
                <strong className="text-foreground">
                  {result.wpm} wpm
                </strong>, {result.accuracy}% accuracy. Typing again won&apos;t
                change today&apos;s recorded result.
              </div>
            )}

            <TypingWords
              spans={spans}
              typed={typed}
              activeWordIndex={activeWordIndex}
              finished={finished}
              onInputChange={handleInputChange}
              inputRef={inputRef}
              className="mb-5"
            />

            {finished ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
                <p className="text-sm">
                  Today&apos;s run: <strong>{wpm} wpm</strong> at{' '}
                  <strong>{accuracy}%</strong> accuracy. Same passage for
                  everyone today — come back tomorrow for a new one.
                </p>
              </div>
            ) : (
              <p className="kicker">Type the passage above</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
