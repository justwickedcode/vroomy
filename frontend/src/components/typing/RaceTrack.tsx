import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'
import PixelSkyline from '#/components/typing/PixelSkyline'
import StartLights from '#/components/typing/StartLights'
import PixelIcon from '#/components/ui/PixelIcon'
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
  // Overdrive is on: the car burns hot.
  overdrive?: boolean
  // A seat nobody filled: the lane stays, with no car in it.
  empty?: boolean
  // Disqualified: the car pulls over onto the shoulder, greyed out, and stays there.
  out?: boolean
}

// One-shot ability effect (see useSoloPowerups / MultiplayerRace) — `key` changes on every use,
// even the same kind back-to-back, so the animated element remounts and replays. Abilities only
// ever help whoever used them, so it plays on one car: `sourceId`'s, or yours when unset.
export interface RaceEffect {
  kind: PowerupKind
  sourceId?: string
  key: number
}

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
// you forever. Everything on the street — rivals, the finish gate, the asphalt itself — is placed
// on one world scale, CAMERA_SCALE % of the track's width per unit of progress, so they all move
// together: a rival a fifth of the race ahead has driven out of sight, and a car that's finished
// stays parked on the line, sliding past exactly as fast as the road.
const CAMERA_X = 26
const CAMERA_SCALE = 400

// How stiff the chase camera's and the rivals' springs are (higher follows tighter).
const CAMERA_STIFFNESS = 3.2
const RIVAL_STIFFNESS = 5

// One step of a critically damped spring at `x` moving at `v` toward `goal`: returns the new
// velocity (the caller advances x by it).
function spring(x: number, v: number, goal: number, omega: number, dt: number) {
  const accel = omega * omega * (goal - x) - 2 * omega * v
  return v + accel * dt
}

function clamp01(n: number) {
  return Math.min(Math.max(n, 0), 1)
}

function carLeft(racer: Racer, camera: number | null) {
  if (camera !== null) {
    if (racer.isYou) return CAMERA_X
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
// Searchlights sweep the sky from the top pylon while the gate's in view; when you cross, pixel
// fireworks go off above it.
const FIREWORKS = [
  { x: -70, y: 34, c: '#ff2fb4', d: 0 },
  { x: 46, y: 58, c: '#22d3ee', d: 280 },
  { x: -10, y: 82, c: '#facc15', d: 560 },
  { x: 90, y: 26, c: '#a3e635', d: 840 },
  { x: -120, y: 66, c: '#c084fc', d: 1120 },
]

function FinishGate({
  left,
  follow,
  celebrate,
}: {
  left: number
  follow: boolean
  celebrate: boolean
}) {
  return (
    <div
      className={cn(
        'race-finish-gate',
        follow && 'race-follow',
        celebrate && 'race-finish-gate--crossed',
      )}
      style={follow ? followStyle(1) : { left: `${left}%` }}
      aria-hidden="true"
    >
      <span className="race-finish-searchlight race-finish-searchlight--a" />
      <span className="race-finish-searchlight race-finish-searchlight--b" />
      <span className="race-finish-laser race-finish-laser--before" />
      <span className="race-finish-laser race-finish-laser--after" />
      <span className="race-finish-strip" />
      <span className="race-finish-post race-finish-post--top" />
      <span className="race-finish-post race-finish-post--bottom" />
      <span className="race-finish-sign">
        <span>Finish</span>
      </span>
      {celebrate &&
        FIREWORKS.map((f) => (
          <span
            key={f.d}
            className="race-firework"
            style={
              {
                '--fx': `${f.x}px`,
                '--fy': `${f.y}px`,
                '--fc': f.c,
                animationDelay: `${f.d}ms`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  )
}

// ─── Road decals ────────────────────────────────────────────────────
// Details on the asphalt that scroll past with the road, so the journey has landmarks: painted
// chevrons, patched tarmac, manholes and puddles reflecting the neon. Each is a pixel SVG drawn
// at the start of a wide transparent tile repeated along the road, so they come by now and then
// rather than in a pattern you can see.

function rect(x: number, y: number, w: number, h: number, fill: string) {
  return `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`
}

// `tile` and `h` are in screen px; the body is drawn in 2px "pixels".
function decal(tile: number, h: number, body: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${h}' viewBox='0 0 ${tile / 2} ${h / 2}' shape-rendering='crispEdges'>${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function chevrons() {
  const parts: Array<string> = []
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 5; i++) {
      parts.push(rect(c * 7 + i, i, 2, 1, 'rgba(244,236,255,0.28)'))
      parts.push(rect(c * 7 + i, 8 - i, 2, 1, 'rgba(244,236,255,0.28)'))
    }
  }
  return parts.join('')
}

function patch() {
  return [
    rect(0, 1, 24, 5, '#1b1724'),
    rect(2, 0, 18, 7, '#1b1724'),
    rect(4, 3, 7, 1, '#322b3d'),
    rect(11, 4, 6, 1, '#322b3d'),
  ].join('')
}

function manhole() {
  const rows = [3, 7, 9, 9, 9, 7, 3]
  return rows
    .map((w, y) =>
      rect(5 - (w - 1) / 2, y, w, 1, y % 2 ? '#2d2737' : '#3b3447'),
    )
    .join('')
}

function puddle() {
  const rows = [10, 18, 22, 18, 10]
  return [
    ...rows.map((w, y) => rect(11 - w / 2, y, w, 1, '#16202e')),
    rect(6, 1, 6, 1, 'rgba(255,47,180,0.55)'),
    rect(14, 2, 4, 1, 'rgba(34,211,238,0.55)'),
    rect(9, 3, 3, 1, 'rgba(250,204,21,0.45)'),
  ].join('')
}

const DECALS: Array<{
  image: string
  tile: number
  h: number
  y: number
  shift: number
}> = [
  { image: decal(1200, 18, chevrons()), tile: 1200, h: 18, y: 28, shift: 300 },
  { image: decal(760, 14, patch()), tile: 760, h: 14, y: 52, shift: 120 },
  { image: decal(980, 14, manhole()), tile: 980, h: 14, y: 88, shift: 520 },
  { image: decal(1400, 10, puddle()), tile: 1400, h: 10, y: 10, shift: 820 },
  { image: decal(1700, 18, chevrons()), tile: 1700, h: 18, y: 72, shift: 1250 },
]

const DECALS_STYLE: CSSProperties = {
  backgroundImage: DECALS.map((d) => d.image).join(','),
  backgroundSize: DECALS.map((d) => `${d.tile}px ${d.h}px`).join(','),
  backgroundRepeat: 'repeat-x',
  backgroundPosition: DECALS.map(
    (d) => `calc(var(--road-pos, 0px) * -1 + ${d.shift}px) ${d.y}%`,
  ).join(','),
}

// ─── Trail effects ──────────────────────────────────────────────────

// Bots always cycle through these three regardless of what the player has unlocked (see
// #/lib/trails) — only the player's own trail choice is gated.
const BOT_TRAILS: Array<TrailVariant> = ['orbs', 'smoke', 'stars']

// Particles per trail, and where each sits: --y is its height in the trail (%), --s its size
// (px), --i its place in the stagger. Fixed values, so every racer's trail looks the same.
const TRAIL_PARTS: Record<TrailVariant, number> = {
  nitro: 4,
  orbs: 7,
  smoke: 5,
  stars: 5,
  rainbow: 6,
  comet: 7,
  coins: 6,
  glitch: 7,
  inferno: 8,
  afterimage: 3,
  hyperspace: 8,
  toxic: 7,
  confetti: 8,
  blizzard: 7,
  hearts: 5,
}
const PART_Y = [48, 22, 70, 36, 60, 14, 82, 44]
const PART_S = [6, 9, 5, 8, 7, 10, 6, 8]

// The effect off the back of a car while it's moving: pixel-art particles in hard-stepped
// animations (see .trail in styles.css). Afterimage needs the car itself, to draw its ghosts.
// Exported for the Garage's trail picker, so its previews are the real thing.
export function Trail({
  variant,
  model,
}: {
  variant: TrailVariant
  model?: CarModel
}) {
  return (
    <span className={cn('trail', `trail--${variant}`)} aria-hidden="true">
      {Array.from({ length: TRAIL_PARTS[variant] }, (_, i) => (
        <span
          key={i}
          style={
            {
              '--i': i,
              '--y': PART_Y[i % PART_Y.length],
              '--s': PART_S[i % PART_S.length],
            } as CSSProperties
          }
        >
          {variant === 'afterimage' && (
            <CarIcon model={model ?? 'sport'} className="race-car-svg w-20" />
          )}
        </span>
      ))}
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

// ─── Lane ───────────────────────────────────────────────────────────

function Lane({
  racer,
  trailVariant,
  effect,
  camera,
  arrive,
}: {
  racer: Racer
  trailVariant: TrailVariant
  effect?: RaceEffect | null
  camera: number | null
  arrive: boolean
}) {
  const left = carLeft(racer, camera)
  const follow = camera !== null && !racer.isYou && !racer.empty
  if (racer.empty) return <div className="race-lane" />
  const racing = racer.progress > 0 && !racer.finished && !racer.out

  // An ability plays on whoever used it: its icon pops over the car, with an exhaust burst for
  // the ones that move it forward. Narrowed into {kind, key} pairs up front so the JSX below
  // doesn't need to re-check `effect` is non-null just to read its fields.
  const mine = effect
    ? effect.sourceId
      ? effect.sourceId === racer.id
      : Boolean(racer.isYou)
    : false
  // Every ability moves its user forward: Boost gets the small burst, the bigger ones nitro's.
  const burst =
    effect && mine
      ? {
          kind:
            effect.kind === 'boost' ? ('boost' as const) : ('nitro' as const),
          key: effect.key,
        }
      : null
  const pop = effect && mine ? { kind: effect.kind, key: effect.key } : null

  return (
    <div
      className={cn('race-lane', follow && 'race-lane--follow')}
      // Under the chase camera, RaceTrack's loop writes this lane's --p every frame (a finished
      // bot parks on the line, progress 1, and rides along with the road).
      data-racer={racer.id}
    >
      <div
        className={cn(
          'race-car-wrap',
          racer.overdrive && 'race-car-wrap--overdrive',
          racer.isYou && 'race-car-wrap--you',
          racer.out && 'race-car-wrap--out',
          arrive && 'race-car-wrap--arrive',
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
        {(racing || arrive) && (
          <Trail variant={trailVariant} model={racer.model} />
        )}
        {racer.isYou && racer.finished && <FinishBurst />}
        {burst && <PowerupBurst key={burst.key} kind={burst.kind} />}
        {pop && (
          <span key={pop.key} className="race-ability-pop" aria-hidden="true">
            <PixelIcon name={pop.kind} className="size-7" />
          </span>
        )}
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
      {follow && (
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
  arrive = false,
  lights = 3,
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
  // A lobby: each car drives in from the left as it appears, and parks on the start line.
  arrive?: boolean
  // How many start lights the countdown gantry has (one per second of the countdown).
  lights?: number
  className?: string
}) {
  const player = racers.find((r) => r.isYou) ?? racers[0]
  // Real races follow your car; the showcase is a fixed tableau.
  // Real races follow your car; the showcase is a fixed tableau, and an endless drill (no finish
  // line, see Practice) just cruises — progress means nothing there, only how fast you type.
  const cruise = !showcase && !finishLine
  const camera =
    showcase || cruise ? null : player.finished ? 1 : clamp01(player.progress)
  // Only your own finish stops the world: while bots are done and you're still typing, the
  // road, city and lights keep rolling at your pace.
  const showFinish = finishLine && Boolean(player.finished)

  const trackRef = useRef<HTMLDivElement>(null)
  const brakingRef = useRef(false)
  // Base speed in px/s — derived from wpm so faster typing = faster world scroll.
  // Kept in a ref so the rAF loop always reads the latest value without re-mounting.
  // The title-screen track runs the world three times faster — it's a high-speed chase, not a
  // race you're typing in.
  const worldSpeed = cruise
    ? player.wpm > 0
      ? 40 + player.wpm * 1.6
      : 0
    : (36 / Math.max(0.44, 1.9 - player.wpm / 110)) * (showcase ? 3 : 1)
  const cruiseRef = useRef(cruise)
  cruiseRef.current = cruise
  const basePxPerSecRef = useRef(worldSpeed)
  basePxPerSecRef.current = worldSpeed
  // Where the chase camera is headed (your progress), for the loop below; null for the showcase.
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const racersRef = useRef(racers)
  racersRef.current = racers

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
    // Chase camera state, in progress units: a smoothed position and speed. Rivals get the same
    // treatment, each in `rivals`, so every car on the road glides instead of stepping.
    let camPos = 0
    let camVel = 0
    const rivals = new Map<string, { x: number; v: number }>()
    const laneEls = new Map<string, HTMLElement>()
    // The exhaust level, eased on its own slower curve so gusts build and die down
    // gradually instead of flicking on and off with each burst of typing.
    let exhaust = 0

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      const target = cameraRef.current
      if (target !== null) {
        // A new race (progress back at the start): jump back to the start line. Nothing else
        // ever moves the camera backward.
        if (target < 0.001 && camPos > 0.01) {
          camPos = 0
          camVel = 0
          rivals.clear()
        }
        // A critically damped spring toward your progress: it follows your keystrokes as one
        // smooth motion, speeds up and slows down like a car (no jolts on a burst of typing or a
        // sudden stop), and never overshoots enough to matter. It never rolls backward.
        const before = camPos
        camVel = spring(camPos, camVel, target, CAMERA_STIFFNESS, dt)
        camPos = Math.min(Math.max(camPos + camVel * dt, before), 1)
        if (dt > 0) camVel = (camPos - before) / dt

        // Rivals: the same spring toward their own progress, written straight onto their lanes
        // (--p) so a 120ms bot tick or a knock-back becomes a glide, not a step.
        for (const racer of racersRef.current) {
          if (racer.isYou) continue
          const goal = racer.finished ? 1 : clamp01(racer.progress)
          const state = rivals.get(racer.id) ?? { x: goal, v: 0 }
          state.v = spring(state.x, state.v, goal, RIVAL_STIFFNESS, dt)
          state.x += state.v * dt
          rivals.set(racer.id, state)
          let lane = laneEls.get(racer.id)
          if (!lane?.isConnected) {
            lane =
              el.querySelector<HTMLElement>(
                `[data-racer="${CSS.escape(racer.id)}"]`,
              ) ?? undefined
            if (lane) laneEls.set(racer.id, lane)
          }
          lane?.style.setProperty('--p', state.x.toFixed(5))
        }
        el.style.setProperty('--cam', camPos.toFixed(5))
        // The road is the same world the cars live in: one unit of progress is CAMERA_SCALE % of
        // the track's width, on the asphalt and on screen alike.
        roadPos = ((camPos * CAMERA_SCALE) / 100) * el.clientWidth
        el.style.setProperty('--road-pos', `${roadPos}px`)
        // How fast you're going right now, 0..1 (~1 around 100 wpm): fades your exhaust in and
        // out with your actual speed.
        const pxPerSec = ((camVel * CAMERA_SCALE) / 100) * el.clientWidth
        const exhaustTarget = Math.min(Math.max(pxPerSec / 180, 0), 1)
        // Picks up in ~0.4s, dies down over ~0.7s.
        exhaust +=
          (exhaustTarget - exhaust) *
          Math.min(dt * (exhaustTarget > exhaust ? 5 : 3), 1)
        el.style.setProperty('--speed', exhaust.toFixed(3))
        rafId = requestAnimationFrame(tick)
        return
      }

      if (brakingRef.current) {
        // Exponential drag: halves every ~0.16 s → effectively stopped in ~1 s
        velocity *= Math.pow(0.01, dt)
        if (velocity < 0.15) velocity = 0
      } else {
        // Ease toward the wpm-based target speed like a car: picking up speed over a second or
        // so, and coasting a little longer down to a stop, never lurching.
        const goal = basePxPerSecRef.current
        const rate = goal > velocity ? 1.6 : 1
        velocity += (goal - velocity) * Math.min(dt * rate, 1)
        if (goal === 0 && velocity < 0.5) velocity = 0
      }

      roadPos += velocity * dt
      el.style.setProperty('--road-pos', `${roadPos}px`)
      // Cruising: the exhaust follows the speed (the showcase leaves it at full).
      if (cruiseRef.current) {
        el.style.setProperty('--speed', Math.min(velocity / 150, 1).toFixed(3))
      }
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
        {epic && (
          <div
            className="race-road-decals"
            style={DECALS_STYLE}
            aria-hidden="true"
          />
        )}
        {racers.map((racer, index) => {
          // A racer can bring its own trail (you, or the dashboard's police); bots without one
          // cycle through BOT_TRAILS.
          const trailVariant: TrailVariant =
            racer.trail ??
            (racer.isYou ? 'nitro' : BOT_TRAILS[index % BOT_TRAILS.length])
          return (
            <Lane
              camera={camera}
              arrive={arrive}
              key={racer.id}
              racer={racer}
              trailVariant={trailVariant}
              effect={effect}
            />
          )
        })}
        <div className="race-curb" aria-hidden="true" />
        {finishLine && (
          <FinishGate
            left={gateLeft(player, camera)}
            follow={camera !== null}
            celebrate={Boolean(player.finished)}
          />
        )}
      </div>

      {phase === 'counting' && countdown !== undefined && (
        <div className="race-countdown-overlay">
          <StartLights remaining={countdown} total={lights} />
        </div>
      )}
    </div>
  )
}
