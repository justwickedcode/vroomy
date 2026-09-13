import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import PaceDial from '#/components/typing/PaceDial'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { useLastPace } from '#/lib/typing/useLastPace'
import { useProfile } from '#/lib/profile/useProfile'
import { handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

export const Route = createFileRoute('/race/solo/')({ component: SoloSetup })

const MIN_WPM = 10
// Covers the fastest preset zone (Warp Speed tops out at 260) so the custom
// dial and the preset tiles agree on what "full scale" means.
const MAX_WPM = SPEED_RANGES[SPEED_RANGES.length - 1].wpm[1]
const CUSTOM_STEP = 5

function SpeedPresetTile({
  range,
  index,
}: {
  range: SpeedRange
  index: number
}) {
  return (
    <Link
      to="/race/solo/$speed"
      params={{ speed: range.id }}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      className="tilt-card glass-chip flex aspect-square flex-col justify-between rounded-xl p-5 text-left transition-colors hover:border-primary/50"
    >
      <span className="font-mono text-xs text-muted-foreground">
        0{index + 1}
      </span>
      <div>
        <span className="block text-lg font-bold">{range.label}</span>
        <span className="mt-1 block font-mono text-xs text-muted-foreground tabular-nums">
          {range.wpm[0]}–{range.wpm[1]} wpm
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5" aria-hidden="true">
        {Array.from({ length: 10 }, (_, bar) => {
          const barWpm = ((bar + 1) / 10) * MAX_WPM
          const lit = barWpm <= range.wpm[1]
          return (
            <span
              key={bar}
              className="flex-1 rounded-full"
              style={{
                background: lit
                  ? 'var(--color-primary)'
                  : 'var(--color-border)',
              }}
            />
          )
        })}
      </div>
    </Link>
  )
}

function CustomPaceTile({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      className="tilt-card flex aspect-square flex-col justify-between rounded-xl border border-dashed border-border p-5 text-left transition-colors hover:border-primary/60 hover:bg-secondary/30"
    >
      <SlidersHorizontal className="size-5 text-primary" strokeWidth={2.5} />
      <div>
        <span className="block text-lg font-bold">Choose yourself</span>
        <span className="mt-1 block font-mono text-xs text-muted-foreground">
          Drag or type an exact number
        </span>
      </div>
    </button>
  )
}

function CustomPaceDialog({
  open,
  onOpenChange,
  bestWpm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bestWpm?: number
}) {
  const [wpm, setWpm] = useLastPace()
  const [draft, setDraft] = useState(String(wpm))

  // Re-sync the text field to the persisted value each time the modal
  // opens — otherwise a half-typed number left over from a cancelled edit
  // would still be sitting in the input next time it appears.
  useEffect(() => {
    if (open) setDraft(String(wpm))
  }, [open, wpm])

  function apply(next: number) {
    const clamped = Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(next)))
    setWpm(clamped)
    setDraft(String(clamped))
  }

  function commitDraft() {
    const parsed = Number(draft)
    apply(Number.isFinite(parsed) ? parsed : wpm)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose your pace</DialogTitle>
          <DialogDescription>
            Drag the dial or type an exact words-per-minute target.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-2">
          <PaceDial
            value={wpm}
            min={MIN_WPM}
            max={MAX_WPM}
            zones={SPEED_RANGES}
            markerValue={bestWpm}
            onChange={apply}
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => apply(wpm - CUSTOM_STEP)}
              aria-label="Decrease pace"
            >
              <Minus />
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_WPM}
              max={MAX_WPM}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitDraft()
              }}
              className="w-24 text-center font-mono text-lg font-bold tabular-nums"
              aria-label="Words per minute"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => apply(wpm + CUSTOM_STEP)}
              aria-label="Increase pace"
            >
              <Plus />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button size="lg" className="w-full" asChild>
            <Link to="/race/solo/$speed" params={{ speed: `custom-${wpm}` }}>
              Race at {wpm} wpm
              <ArrowRight />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SoloSetup() {
  const { hydrated, stats } = useProfile()
  const [customOpen, setCustomOpen] = useState(false)
  const hasRecord = hydrated && stats.bestWpm > 0

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-col gap-8">
        <div className="text-center">
          <div
            className="livery-stripe mx-auto mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Choose your pace.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a preset, or dial in your own number.
          </p>
        </div>

        <Card className="rise-in w-full overflow-hidden">
          <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4">
            {SPEED_RANGES.map((range, i) => (
              <SpeedPresetTile key={range.id} range={range} index={i} />
            ))}
            <CustomPaceTile onOpen={() => setCustomOpen(true)} />
          </CardContent>
        </Card>
      </div>

      <CustomPaceDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        bestWpm={hasRecord ? stats.bestWpm : undefined}
      />
    </main>
  )
}
