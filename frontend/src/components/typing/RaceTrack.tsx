import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'
import PixelSkyline from '#/components/typing/PixelSkyline'
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
  // Cosmetics: set for the player, and for scripted racers like the dashboard's police; race
  // bots leave them unset and get a BOT_TRAILS trail.
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

// The wind: pixel streaks riding the road position faster than the asphalt (`rate` x road
// speed, so they read as air rushing past nearer than the road), one per height (% of the lanes
// area). `tile` spaces the streaks along each line, `shift` staggers the lines. Because they're
// driven by --road-pos, they move exactly as fast as you do — and stand still when you do.
const SPEEDLINES = [
  { top: 8, tile: 620, rate: 2.6, shift: 40 },
  { top: 22, tile: 860, rate: 3.2, shift: 410 },
  { top: 37, tile: 540, rate: 2.2, shift: 230 },
  { top: 51, tile: 980, rate: 3.5, shift: 120 },
  { top: 66, tile: 700, rate: 2.8, shift: 560 },
  { top: 80, tile: 900, rate: 2.4, shift: 300 },
  { top: 93, tile: 760, rate: 3, shift: 650 },
]

// Cars start at 12% and cross the line at 92%.
const CAR_START = 12
const FINISH_X = 92
// Where a bot that's done drives off to: past the line and out of frame, instead of parking on
// the line while you're still racing.
const GONE_X = 115
// The finish gate is part of the world, not the screen: it sits this far (in % of the track per
// unit of your remaining progress) ahead of the line, so it slides in from the right with the
// road during the second half of your race and arrives exactly as your car does.
const GATE_LEAD = 30

// Chase camera (real races): your car holds this spot on screen and the street scrolls past
// you forever; everyone else is drawn where they are relative to you, CAMERA_SCALE % of the track
// per unit of progress apart — so a rival a third of the race ahead has driven out of sight.
const CAMERA_X = 34
const CAMERA_SCALE = 190

function clamp01(n: number) {
  return Math.min(Math.max(n, 0), 1)
}

function carLeft(racer: Racer, camera: number | null) {
  if (camera !== null) {
    if (racer.isYou) return CAMERA_X
    if (racer.finished) return GONE_X
    return CAMERA_X + (clamp01(racer.progress) - camera) * CAMERA_SCALE
  }
  if (racer.finished) return racer.isYou ? FINISH_X : GONE_X
  return CAR_START + (FINISH_X - CAR_START) * clamp01(racer.progress)
}

// Under the chase camera, rival cars and the gate are placed in CSS from their own progress
// (--p) and the camera's smoothed position (--cam, written every frame by RaceTrack's loop): the
// same value that scrolls the road, so the street and everything on it move as one.
function followStyle(p: number): CSSProperties {
  return { '--p': p } as CSSProperties
}

function gateLeft(player: Racer, camera: number | null) {
  if (camera !== null) {
    return player.finished ? CAMERA_X : CAMERA_X + (1 - camera) * CAMERA_SCALE
  }
  if (player.finished) return FINISH_X
  return FINISH_X + (1 - clamp01(player.progress)) * GATE_LEAD
}

// The finish as a place on the road: a pixel checkered strip across the lanes, a light post on
// each barrier, and a neon FINISH sign standing over the top barrier against the skyline.
function FinishGate({ left, follow }: { left: number; follow: boolean }) {
  return (
    <div
      className={cn('race-finish-gate', follow && 'race-follow')}
      style={follow ? followStyle(1) : { left: `${left}%` }}
      aria-hidden="true"
    >
      <span className="race-finish-strip" />
      <span className="race-finish-post race-finish-post--top" />
      <span className="race-finish-post race-finish-post--bottom" />
      <span className="race-finish-sign">Finish</span>
    </div>
  )
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
  camera,
}: {
  racer: Racer
  trailVariant: TrailVariant
  effect?: RaceEffect | null
  camera: number | null
}) {
  const left = carLeft(racer, camera)
  const follow = camera !== null && !racer.isYou
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
    <div
      className={cn('race-lane', follow && 'race-lane--follow')}
      style={
        follow
          ? // A bot that's done keeps going: its --p eases on out past the edge of the screen.
            followStyle(racer.finished ? 2 : clamp01(racer.progress))
          : undefined
      }
    >
      <div
        className={cn(
          'race-car-wrap',
          impact && 'race-car-wrap--hit',
          racer.finished && !racer.isYou && 'race-car-wrap--gone',
          racer.isYou && 'race-car-wrap--you',
          follow && 'race-follow',
        )}
        style={follow ? undefined : { left: `${left}%` }}
      >
        <span
          className={cn('race-name-tag', racer.isYou && 'race-name-tag--you')}
        >
          {racer.name}
          {/* The live speed rides along on the tag instead of a column at the track's edge,
              where it would sit on top of the finish gate. */}
          {racer.progress > 0 && (
            <span className="race-name-wpm">{racer.wpm}</span>
          )}
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
      {/* Out of sight up the road (or behind you): a marker on that edge of the lane says who.
          Shown from CSS, off the same --p/--cam as the car, so they never disagree. */}
      {follow && !racer.finished && (
        <>
          <span
            className="race-offscreen race-offscreen--ahead"
            aria-hidden="true"
          >
            {racer.name} ▸
          </span>
          <span
            className="race-offscreen race-offscreen--behind"
            aria-hidden="true"
          >
            ◂ {racer.name}
          </span>
        </>
      )}
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
  epic = false,
  showcase = false,
  className,
}: {
  racers: Array<Racer>
  countdown?: number
  phase?: 'waiting' | 'counting' | 'ready'
  effect?: RaceEffect | null
  // false for an endless drill with nothing to finish: no flag, and the road never brakes.
  finishLine?: boolean
  // The night scene: a pixel city skyline above the track, neon barriers, streetlights and
  // headlights, speed lines streaking past.
  epic?: boolean
  // The dashboard's title screen on top of that: a taller skyline, bigger cars on taller lanes,
  // no WPM readouts, and the world running three times faster.
  showcase?: boolean
  className?: string
}) {
  const player = racers.find((r) => r.isYou) ?? racers[0]
  // Real races follow your car; the showcase is a fixed tableau.
  const camera = showcase
    ? null
    : player.finished
      ? 1
      : clamp01(player.progress)
  // Only your own finish stops the world: while bots are done and you're still typing, the
  // road, city and lights keep rolling at your pace.
  const showFinish = finishLine && Boolean(player.finished)

  const trackRef = useRef<HTMLDivElement>(null)
  const brakingRef = useRef(false)
  // Base speed in px/s — derived from wpm so faster typing = faster world scroll.
  // Kept in a ref so the rAF loop always reads the latest value without re-mounting.
  // The title-screen track runs the world three times faster — it's a high-speed chase, not a
  // race you're typing in.
  const worldSpeed =
    (36 / Math.max(0.44, 1.9 - player.wpm / 110)) * (showcase ? 3 : 1)
  const basePxPerSecRef = useRef(worldSpeed)
  basePxPerSecRef.current = worldSpeed
  // Where the chase camera is headed (your progress), for the loop below; null for the showcase.
  const cameraRef = useRef(camera)
  cameraRef.current = camera

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
    // Chase camera state, in progress units: a smoothed position and speed, plus recent samples
    // of your real progress to measure your pace from.
    let camPos = 0
    let camVel = 0
    let samples: Array<[number, number]> = []

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      const target = cameraRef.current
      if (target !== null) {
        // A new race: jump back to the start line.
        if (target < camPos - 0.02) {
          camPos = target
          camVel = 0
          samples = []
        }
        // Your pace over the last 1.5s, so the camera glides between keystrokes instead of
        // lurching on each one; a gentle pull toward your actual progress keeps it from drifting.
        samples.push([now, target])
        while (samples.length > 1 && now - samples[0][0] > 1500) samples.shift()
        const [t0, p0] = samples[0]
        const pace = now > t0 ? (target - p0) / ((now - t0) / 1000) : 0
        camVel += (pace - camVel) * Math.min(dt * 4, 1)
        camPos += camVel * dt + (target - camPos) * Math.min(dt * 1.5, 1)
        camPos = Math.min(camPos, 1, target + 0.03)
        el.style.setProperty('--cam', camPos.toFixed(5))
        // The road is the same world the cars live in: one unit of progress is CAMERA_SCALE % of
        // the track's width, on the asphalt and on screen alike.
        roadPos = ((camPos * CAMERA_SCALE) / 100) * el.clientWidth
        el.style.setProperty('--road-pos', `${roadPos}px`)
        // How fast you're going right now, 0..1 (~1 around 100 wpm): fades the wind and your
        // exhaust in and out with your actual speed.
        const pxPerSec = ((camVel * CAMERA_SCALE) / 100) * el.clientWidth
        el.style.setProperty(
          '--speed',
          Math.min(Math.max(pxPerSec / 90, 0), 1).toFixed(3),
        )
        rafId = requestAnimationFrame(tick)
        return
      }

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
    <div
      className={cn(
        'race-track-panel',
        epic && 'race-track-panel--epic',
        showcase && 'race-track-panel--showcase',
        className,
      )}
      ref={trackRef}
    >
      {epic && (
        <PixelSkyline className={showcase ? undefined : 'h-20 sm:h-24'} />
      )}
      <div className="race-lanes-area">
        <div className="race-curb" aria-hidden="true" />
        {racers.map((racer, index) => {
          // A racer can bring its own trail (you, or the dashboard's police); bots without one
          // cycle through BOT_TRAILS.
          const trailVariant: TrailVariant =
            racer.trail ??
            (racer.isYou ? 'nitro' : BOT_TRAILS[index % BOT_TRAILS.length])
          return (
            <Lane
              camera={camera}
              key={racer.id}
              racer={racer}
              trailVariant={trailVariant}
              effect={effect}
            />
          )
        })}
        <div className="race-curb" aria-hidden="true" />
        {epic && (
          <div className="race-speedlines" aria-hidden="true">
            {SPEEDLINES.map((line) => (
              <span
                key={line.top}
                style={{
                  top: `${line.top}%`,
                  backgroundSize: `${line.tile}px 100%`,
                  backgroundPositionX: `calc(var(--road-pos, 0px) * ${-line.rate} + ${line.shift}px)`,
                }}
              />
            ))}
          </div>
        )}
        {finishLine && (
          <FinishGate
            left={gateLeft(player, camera)}
            follow={camera !== null}
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
