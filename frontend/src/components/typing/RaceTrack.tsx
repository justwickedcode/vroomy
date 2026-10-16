import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'
import type { CSSProperties } from 'react'
import type { CarModel } from '#/components/typing/CarIcon'
import type { TrailVariant } from '#/lib/trails'
import type { PowerupKind } from '#/lib/powerups'

export interface Racer {
  id: string
  name: string
  progress: number
  wpm: number
  isYou?: boolean
  finished?: boolean
  model?: CarModel
  // Only ever set for the player's own racer entry — bots/opponents stay in their stock look
  // (see BOT_TRAILS below for theirs).
  underglow?: boolean
  underglowColor?: string
  trail?: TrailVariant
}

// One-shot powerup activation effect (see TypingRace.tsx's usePowerup) — `key` changes on every
// use, even reusing the same kind back-to-back, so consumers can remount the animated element
// instead of it no-op'ing because its own props didn't change. `targetId` names which bot a
// shell/magnet hit landed on; boost/nitro (no target — the effect plays on the player's own car)
// and emp/nuke (play on every lane at once) leave it unset.
export interface RaceEffect {
  kind: PowerupKind
  targetId?: string
  key: number
}

// Cars start at 12% and stop at 92% (finish band position)
const CAR_START = 12
const FINISH_X = 92

function carLeft(racer: Racer) {
  if (racer.finished) return FINISH_X
  const clamped = Math.min(Math.max(racer.progress, 0), 1)
  return CAR_START + (FINISH_X - CAR_START) * clamped
}

// ─── Trail effects ──────────────────────────────────────────────────

// Bots always cycle through these three regardless of what the player has unlocked (see
// #/lib/trails) — only the player's own trail choice is gated.
const BOT_TRAILS: Array<TrailVariant> = ['orbs', 'smoke', 'stars']

// Exported for reuse in the Garage's Trail picker — a preview needs to render the exact same
// visual, not a re-description of it.
export function Trail({ variant }: { variant: TrailVariant }) {
  if (variant === 'orbs') {
    return (
      <span className="race-trail-orbs" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    )
  }
  if (variant === 'smoke') {
    return (
      <span className="race-trail-smoke" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    )
  }
  if (variant === 'stars') {
    return (
      <span className="race-trail-stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    )
  }
  if (variant === 'rainbow') {
    return (
      <span className="race-trail-rainbow" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
    )
  }
  return (
    <span className="race-nitro" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

// ─── Finish celebration ─────────────────────────────────────────────

const CONFETTI: Array<{
  c: string
  r: number
  tx: number
  ty: number
  d: number
}> = [
  { c: '#fbbf24', r: -40, tx: -46, ty: -54, d: 0 },
  { c: '#f472b6', r: 20, tx: 40, ty: -58, d: 30 },
  { c: '#38bdf8', r: 70, tx: 58, ty: -8, d: 70 },
  { c: '#4ade80', r: -90, tx: -60, ty: 4, d: 40 },
  { c: '#a78bfa', r: 140, tx: 36, ty: 50, d: 90 },
  { c: '#fb7185', r: -140, tx: -34, ty: 52, d: 20 },
  { c: '#fbbf24', r: 10, tx: 8, ty: -66, d: 110 },
  { c: '#38bdf8', r: -20, tx: -10, ty: 62, d: 60 },
]

function FinishBurst() {
  return (
    <div className="race-finish-burst" aria-hidden="true">
      <div className="race-finish-flash" />
      {CONFETTI.map((piece, i) => (
        <span
          key={i}
          className="race-finish-confetti"
          style={
            {
              '--c': piece.c,
              '--r': `${piece.r}deg`,
              '--tx': `${piece.tx}px`,
              '--ty': `${piece.ty}px`,
              '--d': `${piece.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

// ─── Powerup activation effects ─────────────────────────────────────
// One-shot visuals for actually *using* a powerup (see the always-visible Trail above for the
// ambient cosmetic one) — mounted fresh per `key` so using the same kind twice in a row still
// replays instead of no-op'ing on unchanged props.

function PowerupBurst({ kind }: { kind: 'boost' | 'nitro' }) {
  return (
    <span
      className={cn('race-powerup-burst', `race-powerup-burst--${kind}`)}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  )
}

function PowerupImpact({ kind }: { kind: 'shell' | 'magnet' }) {
  return (
    <span
      className={cn('race-powerup-impact', `race-powerup-impact--${kind}`)}
      aria-hidden="true"
    >
      <span />
      <span />
    </span>
  )
}

// ─── Lane ───────────────────────────────────────────────────────────

function Lane({
  racer,
  trailVariant,
  effect,
}: {
  racer: Racer
  trailVariant: TrailVariant
  effect?: RaceEffect | null
}) {
  const racing = racer.progress > 0 && !racer.finished

  // Boost/nitro play on the player's own car (there's no bot equivalent); shell/magnet play on
  // whichever bot the hit actually landed on. Narrowed into a {kind, key} pair up front so the
  // JSX below doesn't need to re-check `effect` is non-null just to read its fields.
  const burst =
    effect &&
    racer.isYou &&
    (effect.kind === 'boost' || effect.kind === 'nitro')
      ? { kind: effect.kind, key: effect.key }
      : null
  const impact =
    effect &&
    effect.targetId === racer.id &&
    (effect.kind === 'shell' || effect.kind === 'magnet')
      ? { kind: effect.kind, key: effect.key }
      : null

  return (
    <div className="race-lane">
      <div
        className={cn('race-car-wrap', impact && 'race-car-wrap--hit')}
        style={{ left: `${carLeft(racer)}%` }}
      >
        <span
          className={cn('race-name-tag', racer.isYou && 'race-name-tag--you')}
        >
          {racer.name}
        </span>
        {racing && <Trail variant={trailVariant} />}
        {racer.isYou && racer.finished && <FinishBurst />}
        {burst && <PowerupBurst key={burst.key} kind={burst.kind} />}
        {impact && <PowerupImpact key={impact.key} kind={impact.kind} />}
        <CarIcon
          model={racer.model ?? 'sport'}
          underglow={racer.underglow}
          underglowColor={racer.underglowColor}
          className={cn(
            'race-car-svg w-20 drop-shadow-[0_4px_8px_rgb(0_0_0/0.55)]',
            racing && 'race-car-bob',
          )}
        />
      </div>
      <span className="race-wpm">{racer.wpm} wpm</span>
    </div>
  )
}

// ─── RaceTrack ──────────────────────────────────────────────────────

export default function RaceTrack({
  racers,
  countdown,
  phase,
  effect,
  finishLine = true,
  className,
}: {
  racers: Array<Racer>
  countdown?: number
  phase?: 'waiting' | 'counting' | 'ready'
  effect?: RaceEffect | null
  // false for an endless drill with nothing to finish: no flag, and the road never brakes.
  finishLine?: boolean
  className?: string
}) {
  const player = racers.find((r) => r.isYou) ?? racers[0]
  const showFinish =
    finishLine && racers.some((r) => r.progress >= 0.88 || r.finished)

  const trackRef = useRef<HTMLDivElement>(null)
  const brakingRef = useRef(false)
  // Base speed in px/s — derived from wpm so faster typing = faster world scroll.
  // Kept in a ref so the rAF loop always reads the latest value without re-mounting.
  const basePxPerSecRef = useRef(36 / Math.max(0.44, 1.9 - player.wpm / 110))
  basePxPerSecRef.current = 36 / Math.max(0.44, 1.9 - player.wpm / 110)

  // rAF-driven scroll: runs once for the lifetime of this component instance.
  // All road elements (curbs, dashes, asphalt) share the same roadPos so they're
  // always locked in sync.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const el: HTMLDivElement = track

    let velocity = basePxPerSecRef.current
    let roadPos = 0
    let lastTime = performance.now()
    let rafId = 0

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      if (brakingRef.current) {
        // Exponential drag: halves every ~0.16 s → effectively stopped in ~1 s
        velocity *= Math.pow(0.01, dt)
        if (velocity < 0.15) velocity = 0
      } else {
        // Gently chase the wpm-based target speed so wpm changes feel organic
        velocity += (basePxPerSecRef.current - velocity) * Math.min(dt * 6, 1)
      }

      roadPos += velocity * dt
      el.style.setProperty('--road-pos', `${roadPos}px`)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => {
    brakingRef.current = showFinish
    if (!showFinish) {
      // Race reset — snap world position back to 0
      trackRef.current?.style.setProperty('--road-pos', '0px')
    }
  }, [showFinish])

  return (
    <div className={cn('race-track-panel', className)} ref={trackRef}>
      <div className="race-lanes-area">
        <div className="race-curb" aria-hidden="true" />
        {racers.map((racer, index) => {
          const trailVariant: TrailVariant = racer.isYou
            ? (racer.trail ?? 'nitro')
            : BOT_TRAILS[index % BOT_TRAILS.length]
          return (
            <Lane
              key={racer.id}
              racer={racer}
              trailVariant={trailVariant}
              effect={effect}
            />
          )
        })}
        <div className="race-curb" aria-hidden="true" />
        {finishLine && (
          <span
            className="race-finish-band"
            style={{ left: `${FINISH_X}%` }}
            aria-hidden="true"
          />
        )}
        {effect?.kind === 'emp' && (
          <span
            key={effect.key}
            className="race-emp-flash"
            aria-hidden="true"
          />
        )}
        {effect?.kind === 'nuke' && (
          <span
            key={effect.key}
            className="race-nuke-flash"
            aria-hidden="true"
          />
        )}
      </div>

      {phase === 'counting' && countdown !== undefined && (
        <div className="race-countdown-overlay" aria-live="assertive">
          <span
            key={countdown}
            className={cn(
              'race-countdown-number',
              countdown === 0 && 'race-countdown-number--go',
            )}
          >
            {countdown === 0 ? 'GO!' : countdown}
          </span>
        </div>
      )}
    </div>
  )
}
