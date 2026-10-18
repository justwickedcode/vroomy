import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import RaceTrack from '#/components/typing/RaceTrack'
import TypingWords from '#/components/typing/TypingWords'
import { computeWordSpans } from '#/lib/typing/useTypingRace'
import { frameAt } from '#/lib/replay/playback'
import { cn } from '#/lib/utils'
import type { CSSProperties } from 'react'
import type { CarLook } from '#/lib/carLook'
import type { ReplayData } from '#/lib/api/types'

const SPEEDS = [1, 2, 4] as const

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

const noop = () => {}

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

// Plays a recorded race back through the same RaceTrack/TypingWords/Gauge components the live
// race uses, so a replay looks exactly like the run did — driven by a clock instead of a
// keyboard (see frameAt for how each moment is reconstructed).
export default function ReplayPlayer({
  replay,
  driverName,
  look,
  finalAccuracy,
}: {
  replay: ReplayData
  driverName: string
  look: CarLook
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
            ...look,
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

      {/* The dashboard, as in a race: transport controls, the LCD readouts, and a pixel
          scrubber along the bottom. */}
      <div className="race-console">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause /> : done ? <RotateCcw /> : <Play />}
            {playing ? 'Pause' : done ? 'Replay' : 'Play'}
          </Button>
          <div className="flex gap-[2px] border-2 border-border bg-border">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  'px-2.5 py-1 font-mono text-xs font-semibold tabular-nums',
                  speed === s
                    ? 'bg-[#2a1238] text-foreground shadow-[inset_0_-2px_0_#ff2fb4]'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="race-lcd">
          <Lcd value={frame.wpm} label="wpm" big />
          <Lcd value={`${finalAccuracy}%`} label="acc" />
          <Lcd value={formatTime(t)} label="time" />
        </div>
        <span className="text-right font-mono text-xs text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>
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
        className="replay-scrub"
        style={
          { '--fill': `${(t / Math.max(duration, 1)) * 100}%` } as CSSProperties
        }
        aria-label="Replay position"
      />
    </div>
  )
}
