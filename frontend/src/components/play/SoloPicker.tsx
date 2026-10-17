import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  SlidersHorizontal,
} from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import PaceDial from '#/components/typing/PaceDial'
import PixelMeter from '#/components/ui/PixelMeter'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { useLastPace } from '#/lib/typing/useLastPace'
import { useProfile } from '#/lib/profile/useProfile'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'
import PixelIcon from '#/components/ui/PixelIcon'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

// Solo setup: pick a preset bot pace, or "Choose yourself" to dial in an exact WPM. Used in the
// dashboard's Solo modal and on /race/solo.

const MIN_WPM = 10
// Covers the fastest preset zone (Warp Speed tops out at 260) so the custom
// dial and the preset tiles agree on what "full scale" means.
const MAX_WPM = SPEED_RANGES[SPEED_RANGES.length - 1].wpm[1]
const CUSTOM_STEP = 5

// Slow paces green, the fastest red — the same calm/working/redline idea as the gauges.
const PACE_COLORS = [
  'var(--color-success)',
  'var(--color-success)',
  'var(--color-success)',
  'var(--color-signal)',
  'var(--color-signal)',
  'var(--color-destructive)',
  'var(--color-destructive)',
]

function SpeedPresetTile({
  range,
  index,
  chaos,
}: {
  range: SpeedRange
  index: number
  chaos: boolean
}) {
  return (
    <Link
      to="/race/solo/$speed"
      params={{ speed: range.id }}
      search={chaos ? { chaos: true } : {}}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      className="tilt-card glass-chip flex flex-col gap-3 p-4 text-left transition-colors hover:border-primary/50"
    >
      <div>
        <span className="block text-base font-bold">{range.label}</span>
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">
          {range.wpm[0]}–{range.wpm[1]} wpm
        </span>
      </div>
      <PixelMeter
        frac={range.wpm[1] / MAX_WPM}
        color={PACE_COLORS[index] ?? 'var(--color-destructive)'}
        className="gap-[2px]"
      />
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
      className="tilt-card px-corners flex flex-col justify-between gap-3 border-2 border-dashed border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-secondary/30"
    >
      <SlidersHorizontal className="size-5 text-primary" strokeWidth={2.5} />
      <div>
        <span className="block text-base font-bold">Choose yourself</span>
      </div>
    </button>
  )
}

function CustomPace({ onBack, chaos }: { onBack: () => void; chaos: boolean }) {
  const { hydrated, stats } = useProfile()
  const bestWpm = hydrated && stats.bestWpm > 0 ? stats.bestWpm : undefined
  const [wpm, setWpm] = useLastPace()
  const [draft, setDraft] = useState(String(wpm))

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
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={onBack}
      >
        <ArrowLeft />
        Presets
      </Button>
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
      <Button size="lg" className="w-full" asChild>
        <Link
          to="/race/solo/$speed"
          params={{ speed: `custom-${wpm}` }}
          search={chaos ? { chaos: true } : {}}
        >
          Race at {wpm} wpm
          <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}

// Classic: your equipped ability, once. Chaos: an item roulette for everyone, bots included.
const MODES = [
  {
    id: 'classic',
    label: 'Classic',
    icon: 'flag',
    blurb: 'Your ability, once',
  },
  {
    id: 'chaos',
    label: 'Chaos',
    icon: 'disco',
    blurb: 'Random abilities for everyone — bots fight back',
  },
] as const

function ModeSwitch({
  chaos,
  onChange,
}: {
  chaos: boolean
  onChange: (chaos: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-[2px] border-2 border-border bg-border">
      {MODES.map((mode) => {
        const active = (mode.id === 'chaos') === chaos
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id === 'chaos')}
            className={cn(
              'flex items-center gap-3 p-3 text-left transition-colors',
              active
                ? 'bg-[#2a1238] shadow-[inset_0_-3px_0_#ff2fb4]'
                : 'bg-card hover:bg-accent',
            )}
          >
            <PixelIcon name={mode.icon} className="size-7" />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg uppercase">
                {mode.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {mode.blurb}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function SoloPicker() {
  const [custom, setCustom] = useState(false)
  const [chaos, setChaos] = useState(false)
  if (custom)
    return <CustomPace onBack={() => setCustom(false)} chaos={chaos} />
  return (
    <div className="flex flex-col gap-4">
      <ModeSwitch chaos={chaos} onChange={setChaos} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SPEED_RANGES.map((range, i) => (
          <SpeedPresetTile
            key={range.id}
            range={range}
            index={i}
            chaos={chaos}
          />
        ))}
        <CustomPaceTile onOpen={() => setCustom(true)} />
      </div>
    </div>
  )
}
