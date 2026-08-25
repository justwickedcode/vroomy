import { useState } from 'react'
import { ArrowLeft, Bot, Users } from 'lucide-react'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

type Step = 'mode' | 'solo' | 'multiplayer'

function ModeStep({
  onPick,
}: {
  onPick: (mode: 'solo' | 'multiplayer') => void
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-12 text-center">
      <div>
        <p className="kicker mb-2">Vroomy</p>
        <h2 className="text-xl font-bold sm:text-2xl">Choose how to race</h2>
      </div>

      <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="speed-option glass-chip flex flex-col items-center gap-1 py-5"
          onClick={() => onPick('solo')}
        >
          <Bot className="mb-1 size-6 text-primary" />
          <span className="text-sm font-bold">Solo vs AI</span>
          <span className="kicker">race a bot at your pace</span>
        </button>

        <button
          type="button"
          className="speed-option glass-chip flex flex-col items-center gap-1 py-5"
          onClick={() => onPick('multiplayer')}
        >
          <Users className="mb-1 size-6 text-muted-foreground" />
          <span className="text-sm font-bold">Multiplayer</span>
          <Badge variant="secondary" className="mt-0.5">
            coming soon
          </Badge>
        </button>
      </div>
    </div>
  )
}

function MultiplayerStep({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
      <Users className="size-8 text-muted-foreground" />
      <h2 className="text-lg font-bold">
        Multiplayer will be implemented soon!
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Real-time races against other players are coming in a later update — for
        now, sharpen up in Solo vs AI.
      </p>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft />
        Back
      </Button>
    </div>
  )
}

function SoloStep({
  onBack,
  onStart,
}: {
  onBack: () => void
  onStart: (range: SpeedRange) => void
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-12 text-center">
      <div>
        <p className="kicker mb-2">Solo vs AI</p>
        <h2 className="text-xl font-bold sm:text-2xl">
          Pick a speed to race against
        </h2>
      </div>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {SPEED_RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            onClick={() => onStart(range)}
            className="speed-option glass-chip"
          >
            <span className="block text-sm font-bold">{range.label}</span>
            <span className="kicker mt-1 block">
              {range.wpm[0]}–{range.wpm[1]} wpm
            </span>
          </button>
        ))}
      </div>

      <Button variant="outline" onClick={onBack}>
        <ArrowLeft />
        Back
      </Button>
    </div>
  )
}

export default function RaceSetup({
  onStart,
}: {
  onStart: (range: SpeedRange) => void
}) {
  const [step, setStep] = useState<Step>('mode')

  if (step === 'mode') {
    return <ModeStep onPick={setStep} />
  }

  if (step === 'multiplayer') {
    return <MultiplayerStep onBack={() => setStep('mode')} />
  }

  return <SoloStep onBack={() => setStep('mode')} onStart={onStart} />
}
