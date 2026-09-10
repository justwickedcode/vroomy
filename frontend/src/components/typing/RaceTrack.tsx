import { useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'
import type { CSSProperties } from 'react'
import type { CarModel } from '#/components/typing/CarIcon'

export interface Racer {
  id: string
  name: string
  progress: number
  wpm: number
  isYou?: boolean
  finished?: boolean
  color?: string
  model?: CarModel
}

// Cars start at 12% and stop at 92% (finish band position)
const CAR_START = 12
const FINISH_X = 92

function carLeft(racer: Racer) {
  if (racer.finished) return FINISH_X
  const clamped = Math.min(Math.max(racer.progress, 0), 1)
  return CAR_START + (FINISH_X - CAR_START) * clamped
}

// ─── Crowd / grandstand ─────────────────────────────────────────────

const SECTION_COLORS = [
  ['#fca5a5', '#ef4444', '#fca5a5', '#dc2626'],
  ['#93c5fd', '#3b82f6', '#93c5fd', '#1d4ed8'],
  ['#fde68a', '#f59e0b', '#fde68a', '#d97706'],
  ['#c4b5fd', '#8b5cf6', '#c4b5fd', '#7c3aed'],
  ['#86efac', '#22c55e', '#86efac', '#16a34a'],
  ['#fdba74', '#f97316', '#fdba74', '#ea580c'],
  ['#67e8f9', '#06b6d4', '#67e8f9', '#0891b2'],
  ['#f9a8d4', '#ec4899', '#f9a8d4', '#db2777'],
  ['#a5b4fc', '#6366f1', '#a5b4fc', '#4f46e5'],
  ['#bef264', '#84cc16', '#bef264', '#65a30d'],
] as const

const SECTION_BG = [
  '#7f1d1d',
  '#1e3a8a',
  '#78350f',
  '#4c1d95',
  '#14532d',
  '#7c2d12',
  '#0c4a6e',
  '#831843',
  '#1e1b4b',
  '#365314',
] as const

const CROWD_ROWS = [
  { yLo: 63, yHi: 60, rLo: 4, rHi: 4 },
  { yLo: 77, yHi: 73, rLo: 5, rHi: 5 },
  { yLo: 91, yHi: 87, rLo: 5, rHi: 6 },
  { yLo: 106, yHi: 101, rLo: 6, rHi: 7 },
  { yLo: 121, yHi: 116, rLo: 7, rHi: 8 },
] as const

const X_OFFSETS = [6, 20, 33, 46, 59, 72, 85, 98] as const
const BLEACHER_ROWS = [54, 69, 84, 99, 114] as const

const CAMERA_FLASHES: Array<{
  cx: number
  cy: number
  r: number
  d: string
  delay: string
}> = [
  { cx: 80, cy: 98, r: 3, d: '2.3s', delay: '.4s' },
  { cx: 205, cy: 88, r: 3, d: '3.1s', delay: '1.1s' },
  { cx: 350, cy: 102, r: 3, d: '1.9s', delay: '.7s' },
  { cx: 490, cy: 92, r: 3, d: '2.7s', delay: '1.8s' },
  { cx: 625, cy: 99, r: 3, d: '2.1s', delay: '.2s' },
  { cx: 748, cy: 86, r: 3, d: '3.4s', delay: '2.2s' },
  { cx: 872, cy: 95, r: 3, d: '1.7s', delay: '1.5s' },
  { cx: 1022, cy: 91, r: 3, d: '2.9s', delay: '.9s' },
  { cx: 155, cy: 112, r: 2, d: '2.5s', delay: '2.8s' },
  { cx: 542, cy: 116, r: 2, d: '1.8s', delay: '3.2s' },
  { cx: 930, cy: 110, r: 2, d: '3.0s', delay: '.5s' },
]

function CrowdTile({ dx = 0 }: { dx?: number }) {
  return (
    <g transform={dx ? `translate(${dx},0)` : undefined}>
      {BLEACHER_ROWS.map((y) => (
        <rect
          key={y}
          x={0}
          y={y}
          width={1100}
          height={8}
          fill="#0a1020"
          opacity={0.75}
        />
      ))}
      {SECTION_BG.map((fill, i) => (
        <rect
          key={i}
          x={i * 110}
          y={56}
          width={110}
          height={76}
          fill={fill}
          opacity={0.8}
        />
      ))}
      {[110, 220, 330, 440, 550, 660, 770, 880, 990].map((x) => (
        <line
          key={x}
          x1={x}
          y1={56}
          x2={x}
          y2={132}
          stroke="rgba(0,0,0,.4)"
          strokeWidth={2}
        />
      ))}
      {CROWD_ROWS.flatMap((row, ri) =>
        SECTION_COLORS.flatMap((cols, si) =>
          X_OFFSETS.map((xOff, ci) => (
            <circle
              key={`${ri}-${si}-${ci}`}
              cx={si * 110 + xOff}
              cy={ci % 2 === 1 ? row.yHi : row.yLo}
              r={ci % 2 === 1 ? row.rHi : row.rLo}
              fill={cols[ci % 4]}
            />
          )),
        ),
      )}
      {CAMERA_FLASHES.map((f, i) => (
        <circle
          key={i}
          className="cf"
          cx={f.cx}
          cy={f.cy}
          r={f.r}
          fill="white"
          style={{ '--d': f.d, '--delay': f.delay } as CSSProperties}
        />
      ))}
    </g>
  )
}

function Grandstand() {
  return (
    <div className="race-grandstand" aria-hidden="true">
      <div className="race-flags-band" />
      <svg
        className="race-crowd-svg"
        width={2200}
        height={132}
        viewBox="0 0 2200 132"
      >
        <CrowdTile />
        <CrowdTile dx={1100} />
      </svg>
    </div>
  )
}

// ─── Sponsor strip ──────────────────────────────────────────────────

const SPONSORS = [
  {
    logo: '🌽',
    name: 'CORNDOG',
    tag: "NITRO FUEL · EST. '99",
    bg: 'linear-gradient(105deg,#7c0e0e,#b91c1c 60%,#991b1b)',
  },
  {
    logo: '⚡',
    name: 'NITRO·N',
    tag: 'UNLIMITED POWER',
    bg: 'linear-gradient(105deg,#0d1f5c,#1d4ed8 60%,#1e40af)',
  },
  {
    logo: '🏷️',
    name: 'STICKER STAN',
    tag: '10,000+ DECALS',
    bg: 'linear-gradient(105deg,#5c2d00,#c2410c 60%,#92400e)',
  },
  {
    logo: '🏙️',
    name: 'MIDTOWN',
    tag: 'DRIVE FAST BUY USED',
    bg: 'linear-gradient(105deg,#1a1048,#4338ca 60%,#312e81)',
  },
  {
    logo: '🚘',
    name: 'HAI AUTO',
    tag: 'HYPER AUTO IMPORTS',
    bg: 'linear-gradient(105deg,#052e16,#16a34a 60%,#15803d)',
  },
  {
    logo: '🔥',
    name: 'SPEED BOOST',
    tag: '3× MORE FAST™',
    bg: 'linear-gradient(105deg,#2e1065,#7c3aed 60%,#6d28d9)',
  },
  {
    logo: '🏁',
    name: 'RACECLOUD',
    tag: 'DRIFT AS A SERVICE',
    bg: 'linear-gradient(105deg,#082f49,#0284c7 60%,#0369a1)',
  },
  {
    logo: '💎',
    name: 'GEMTYRES',
    tag: 'GRIP OR RIP™',
    bg: 'linear-gradient(105deg,#4a0523,#be185d 60%,#9d174d)',
  },
] as const

function SponsorStrip() {
  const tiles = [...SPONSORS, ...SPONSORS]
  return (
    <div className="race-sponsor-strip" aria-hidden="true">
      <div className="race-sponsor-inner">
        {tiles.map((s, i) => (
          <div
            key={i}
            className="race-sponsor-block"
            style={{ background: s.bg }}
          >
            <span className="race-sponsor-logo">{s.logo}</span>
            <span className="race-sponsor-name">
              {s.name}
              <span className="race-sponsor-tag">{s.tag}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Trail effects ──────────────────────────────────────────────────

const BOT_TRAILS = ['orbs', 'smoke', 'spark'] as const
type TrailVariant = 'nitro' | (typeof BOT_TRAILS)[number]

function Trail({ variant }: { variant: TrailVariant }) {
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
      </span>
    )
  }
  if (variant === 'spark') {
    return (
      <svg className="race-trail-spark" viewBox="0 0 32 18" aria-hidden="true">
        <polyline
          points="32,4 18,8 24,9 8,14 14,10 0,9"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return <span className="race-nitro" aria-hidden="true" />
}

// ─── Lane ───────────────────────────────────────────────────────────

function Lane({
  racer,
  trailVariant,
}: {
  racer: Racer
  trailVariant: TrailVariant
}) {
  const color =
    racer.color ?? (racer.isYou ? 'var(--color-primary)' : '#94a3b8')
  const racing = racer.progress > 0 && !racer.finished

  return (
    <div className="race-lane">
      <div className="race-car-wrap" style={{ left: `${carLeft(racer)}%` }}>
        <span
          className={cn('race-name-tag', racer.isYou && 'race-name-tag--you')}
        >
          {racer.name}
        </span>
        {racing && <Trail variant={trailVariant} />}
        <CarIcon
          color={color}
          model={racer.model ?? 'sport'}
          className={cn(
            'race-car-svg aspect-[8/5] w-20 drop-shadow-[0_4px_8px_rgb(0_0_0/0.55)]',
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
  className,
}: {
  racers: Array<Racer>
  countdown?: number
  phase?: 'waiting' | 'counting' | 'ready'
  className?: string
}) {
  const player = racers.find((r) => r.isYou) ?? racers[0]
  const showFinish = racers.some((r) => r.progress >= 0.88 || r.finished)

  const trackRef = useRef<HTMLDivElement>(null)
  const brakingRef = useRef(false)
  // Base speed in px/s — derived from wpm so faster typing = faster world scroll.
  // Kept in a ref so the rAF loop always reads the latest value without re-mounting.
  const basePxPerSecRef = useRef(36 / Math.max(0.44, 1.9 - player.wpm / 110))
  basePxPerSecRef.current = 36 / Math.max(0.44, 1.9 - player.wpm / 110)

  // Tile widths for seamless looping — crowd SVG is 2×1100px, sponsor inner is 8×183px
  const CROWD_TILE = 1100
  const SPONSOR_TILE = 1464

  // rAF-driven scroll: runs once for the lifetime of this component instance.
  // All road elements (curbs, dashes, flags, crowd, sponsors) share the same
  // roadPos so they're always locked in sync. Crowd and sponsor use CSS vars
  // with JS modulo so the container never drifts to huge negative values.
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
      el.style.setProperty('--crowd-pos', `${roadPos % CROWD_TILE}px`)
      el.style.setProperty('--sponsor-pos', `${roadPos % SPONSOR_TILE}px`)
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
      trackRef.current?.style.setProperty('--crowd-pos', '0px')
      trackRef.current?.style.setProperty('--sponsor-pos', '0px')
    }
  }, [showFinish])

  return (
    <div className={cn('race-track-panel', className)} ref={trackRef}>
      <Grandstand />
      <SponsorStrip />
      <div className="race-lanes-area">
        <div className="race-curb" aria-hidden="true" />
        {racers.map((racer, index) => {
          const trailVariant: TrailVariant = racer.isYou
            ? 'nitro'
            : BOT_TRAILS[index % BOT_TRAILS.length]
          return (
            <Lane key={racer.id} racer={racer} trailVariant={trailVariant} />
          )
        })}
        <div className="race-curb" aria-hidden="true" />
        <span
          className="race-finish-band"
          style={{ left: `${FINISH_X}%` }}
          aria-hidden="true"
        />
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
