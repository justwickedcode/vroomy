import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import Gauge from '#/components/typing/Gauge'
import DigitalReadout from '#/components/typing/DigitalReadout'
import { computeWordSpans } from '#/lib/typing/useTypingRace'
import { frameAt } from '#/lib/replay/playback'
import { cn } from '#/lib/utils'
import type { CarModel } from '#/components/typing/CarIcon'
import type { TrailVariant } from '#/lib/trails'
import type { ReplayData } from '#/lib/api/types'

const WPM_GAUGE_MAX = 130
const SPEEDS = [1, 2, 4] as const

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

const noop = () => {}

// Plays a recorded race back through the same RaceTrack/TypingWords/Gauge components the live
// race uses, so a replay looks exactly like the run did — driven by a clock instead of a
// keyboard (see frameAt for how each moment is reconstructed).
export default function ReplayPlayer({
  replay,
  driverName,
  carModel,
  trail,
  finalAccuracy,
}: {
  replay: ReplayData
  driverName: string
  carModel?: CarModel
  trail?: TrailVariant
  finalAccuracy: number
}) {
  const spans = useMemo(
    () => computeWordSpans(replay.passage),
    [replay.passage],
  )
  const duration = replay.events.at(-1)?.[0] ?? 0

  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const inputRef = useRef<HTMLInputElement>(null)

  // The clock lives in a ref so the rAF loop can advance it without re-subscribing every frame;
  // t is the rendered copy.
  const tRef = useRef(0)
  tRef.current = t

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    function tick(now: number) {
      const next = Math.min(tRef.current + (now - last) * speed, duration)
      last = now
      tRef.current = next
      setT(next)
      if (next >= duration) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration])

  const frame = frameAt(replay.passage, spans, replay.events, t)
  const done = t >= duration

  function togglePlay() {
    if (done) {
      tRef.current = 0
      setT(0)
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }

  return (
    <div className="flex flex-col">
      <RaceTrack
        racers={[
          {
            id: 'replay',
            name: driverName,
            progress: frame.progress,
            wpm: frame.wpm,
            finished: frame.finished,
            isYou: true,
            model: carModel,
            trail,
          },
        ]}
        phase="ready"
        epic
        className="flex-shrink-0"
      />

      <TypingWords
        spans={spans}
        typed={frame.typed}
        activeWordIndex={frame.activeWordIndex}
        finished={frame.finished}
        locked={false}
        errorSeq={frame.errorSeq}
        onInputChange={noop}
        inputRef={inputRef}
        className="pointer-events-none shrink-0"
      />

      <div className="flex flex-col gap-4 p-4">
        <input
          type="range"
          min={0}
          max={duration}
          step={10}
          value={t}
          onChange={(e) => {
            tRef.current = Number(e.target.value)
            setT(tRef.current)
          }}
          className="w-full accent-primary"
          aria-label="Replay position"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={togglePlay}>
              {playing ? <Pause /> : done ? <RotateCcw /> : <Play />}
              {playing ? 'Pause' : done ? 'Replay' : 'Play'}
            </Button>
            <div className="flex border-2 border-border">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold tabular-nums',
                    speed === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Gauge label="wpm" value={frame.wpm} max={WPM_GAUGE_MAX} />
            <Gauge
              label="accuracy"
              value={finalAccuracy}
              max={100}
              suffix="%"
            />
            <DigitalReadout
              label="time"
              value={`${formatTime(t)} / ${formatTime(duration)}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
