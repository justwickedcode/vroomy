import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Minus, Plus } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import PaceDial from '#/components/typing/PaceDial'
import PixelIcon from '#/components/ui/PixelIcon'
import { PlaySection, StartButton } from '#/components/play/PlayKit'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import { useLastPace } from '#/lib/typing/useLastPace'
import { useProfile } from '#/lib/profile/useProfile'
import type { SpeedRange } from '#/lib/typing/useBotRacers'
import type { CSSProperties } from 'react'

// Solo's part of the Play picker (see PlayPicker): the bot pace — one of the presets, or "Your
// pace" to dial in an exact WPM — then off you go.

const MIN_WPM = 10
// Covers the fastest preset zone (Warp Speed tops out at 260) so the custom
// picker and the preset tiles agree on what "full scale" means.
const MAX_WPM = SPEED_RANGES[SPEED_RANGES.length - 1].wpm[1]
const CUSTOM_STEP = 5

// Slow paces green, the fastest red — the same calm/working/redline idea as the pace picker.
const PACE_COLORS = [
  '#4ade80',
  '#4ade80',
  '#4ade80',
  '#facc15',
  '#facc15',
  '#f43f5e',
  '#f43f5e',
]

function abilitiesSearch(abilities: boolean) {
  return abilities ? {} : { abilities: 'off' as const }
}

// One pace "gear": a pixel bar that climbs higher (and from green to red) gear by gear, with
// the name and WPM range under it — the seven presets read as one rising staircase.
function SpeedPresetTile({
  range,
  index,
  abilities,
}: {
  range: SpeedRange
  index: number
  abilities: boolean
}) {
  return (
    <Link
      to="/race/solo/$speed"
      params={{ speed: range.id }}
      search={abilitiesSearch(abilities)}
      className="pace-gear"
      style={{ '--gear': PACE_COLORS[index] ?? '#f43f5e' } as CSSProperties}
    >
      <span className="pace-gear-bar" aria-hidden="true">
        {Array.from({ length: SPEED_RANGES.length }, (_, i) => (
          <span key={i} className={i <= index ? 'is-lit' : undefined} />
        ))}
      </span>
      <span className="pace-gear-name">{range.label}</span>
      <span className="pace-gear-wpm">
        {range.wpm[0]}–{range.wpm[1]}
      </span>
    </Link>
  )
}

function CustomPace({
  onBack,
  abilities,
}: {
  onBack: () => void
  abilities: boolean
}) {
  const { hydrated, stats } = useProfile()
  const bestWpm = hydrated && stats.bestWpm > 0 ? stats.bestWpm : undefined
  const [wpm, setWpm] = useLastPace()
  // What's being typed into the number box, only while editing; otherwise it shows the pace
  // itself (which can load from storage after mount), so the two never disagree.
  const [draft, setDraft] = useState<string | null>(null)

  function apply(next: number) {
    const clamped = Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(next)))
    setWpm(clamped)
    setDraft(null)
  }

  function commitDraft() {
    if (draft === null) return
    const parsed = Number(draft)
    apply(Number.isFinite(parsed) && draft !== '' ? parsed : wpm)
  }

  return (
    <>
      <PlaySection
        label="Your pace"
        aside={
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft />
            Presets
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-4 pb-1">
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
            <input
              type="number"
              inputMode="numeric"
              min={MIN_WPM}
              max={MAX_WPM}
              value={draft ?? String(wpm)}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitDraft()
              }}
              className="play-input w-24 text-center"
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
      </PlaySection>
      <div className="bg-card p-4">
        <StartButton asChild>
          <Link
            to="/race/solo/$speed"
            params={{ speed: `custom-${wpm}` }}
            search={abilitiesSearch(abilities)}
          >
            Race at {wpm} wpm
            <ArrowRight />
          </Link>
        </StartButton>
      </div>
    </>
  )
}

export default function SoloPicker({ abilities }: { abilities: boolean }) {
  const [custom, setCustom] = useState(false)
  if (custom)
    return <CustomPace onBack={() => setCustom(false)} abilities={abilities} />
  return (
    <PlaySection label="Bot pace">
      <div className="grid grid-cols-8 border-2 border-border [&>*]:shadow-[0_0_0_1px_var(--color-border)]">
        {SPEED_RANGES.map((range, i) => (
          <SpeedPresetTile
            key={range.id}
            range={range}
            index={i}
            abilities={abilities}
          />
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className="pace-gear"
        >
          <span
            className="pace-gear-bar pace-gear-bar--custom"
            aria-hidden="true"
          >
            <PixelIcon name="sliders" className="size-6" />
          </span>
          <span className="pace-gear-name">Your pace</span>
          <span className="pace-gear-wpm">10–260</span>
        </button>
      </div>
    </PlaySection>
  )
}
