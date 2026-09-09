import { useId, useRef, useState } from 'react'
import { arcPath, polar } from '#/lib/typing/gaugeMath'
import type { PointerEvent as ReactPointerEvent } from 'react'

// A speedometer, not a form control — matches the gauge motif used
// everywhere else in the app (the logo, the WPM/accuracy readouts) so
// "this sets a speed" reads from the shape alone, no caption needed.
const START_DEG = 225
const SWEEP_DEG = 270
const GAP_DEG = 360 - SWEEP_DEG
const RADIUS = 34
const FACE_RADIUS = 39
// A real gauge has a machined metal ring between the glass and the label
// print, not a 2px outline — widened from a bare rim into an actual bezel
// band so there's material there to put a brushed-metal gradient and a
// knurled grip texture on.
const BEZEL_RADIUS = 43
const LABEL_RADIUS = 46.5
const KNURL_COUNT = 40

// Needle geometry — a tapered kite shape (tip / shoulders / short tail
// counterweight) rather than a plain line, so it reads as a real gauge
// needle instead of a clock hand.
const NEEDLE_TIP_RADIUS = 37
const NEEDLE_TAIL_RADIUS = 8
const NEEDLE_HALF_WIDTH = 2.1
const HUB_RADIUS = 5.5

// The fill arc and digital readout read as a load meter, not a static
// brand-blue bar — green for realistic pace, climbing through yellow, and
// red once past the breakpoint into the "unrealistic" zone, same
// green/yellow/red language a real tachometer or boost gauge uses. Color
// bounds line up with the dial's own realistic/unrealistic split (below),
// so red paint always means "past the breakpoint," never an arbitrary half.
const SPEED_GREEN = 'oklch(0.72 0.19 145)'
const SPEED_YELLOW = 'oklch(0.85 0.17 95)'
const SPEED_RED = 'var(--color-destructive)'

function speedColor(
  value: number,
  min: number,
  breakpoint: number,
  max: number,
): string {
  if (breakpoint > min && value <= breakpoint) {
    const localT = Math.max(0, Math.min(1, (value - min) / (breakpoint - min)))
    return `color-mix(in oklch, ${SPEED_YELLOW} ${Math.round(localT * 100)}%, ${SPEED_GREEN})`
  }
  const localT = Math.max(
    0,
    Math.min(1, (value - breakpoint) / (max - breakpoint)),
  )
  return `color-mix(in oklch, ${SPEED_RED} ${Math.round(localT * 100)}%, ${SPEED_YELLOW})`
}

export interface PaceZone {
  label: string
  wpm: [number, number]
}

export function zoneNameFor(zones: Array<PaceZone>, wpm: number) {
  const sorted = [...zones].sort((a, b) => a.wpm[0] - b.wpm[0])
  if (sorted.length === 0 || wpm < sorted[0].wpm[0]) return 'Parked'
  let name = sorted[0].label
  for (const zone of sorted) {
    if (wpm >= zone.wpm[0]) name = zone.label
  }
  return name
}

export default function PaceDial({
  value,
  min,
  max,
  step = 10,
  majorTickStep = 50,
  zones = [],
  markerValue,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  majorTickStep?: number
  zones?: Array<PaceZone>
  markerValue?: number
  onChange: (next: number) => void
}) {
  const uid = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)

  // Redline the last zone (and a half) instead of the whole top tier, the
  // same way a tachometer only paints the final slice of the dial red. It
  // also doubles as the realistic/unrealistic breakpoint for the fill/
  // readout color below, so "past the redline" means the same thing
  // everywhere.
  const sortedZones = [...zones].sort((a, b) => a.wpm[0] - b.wpm[0])
  const warningFrom = sortedZones.at(-2)?.wpm[0]
  const breakpoint = warningFrom ?? min + (max - min) * 0.6

  const t = (value - min) / (max - min)
  const fillColor = speedColor(value, min, breakpoint, max)
  const trackPath = arcPath(START_DEG, START_DEG + SWEEP_DEG, RADIUS)

  const needleDeg = START_DEG + t * SWEEP_DEG
  const needleTip = polar(needleDeg, NEEDLE_TIP_RADIUS)
  const needleTail = polar(needleDeg + 180, NEEDLE_TAIL_RADIUS)
  const needleLeft = polar(needleDeg - 90, NEEDLE_HALF_WIDTH)
  const needleRight = polar(needleDeg + 90, NEEDLE_HALF_WIDTH)
  const needlePath = `M ${needleTip.x} ${needleTip.y} L ${needleRight.x} ${needleRight.y} L ${needleTail.x} ${needleTail.y} L ${needleLeft.x} ${needleLeft.y} Z`

  const majorTicks: Array<number> = []
  for (let v = majorTickStep; v <= max; v += majorTickStep) {
    if (v >= min) majorTicks.push(v)
  }

  const minorTickStep = Math.max(step, majorTickStep / 5)
  const minorTicks: Array<number> = []
  for (
    let v = Math.ceil(min / minorTickStep) * minorTickStep;
    v <= max;
    v += minorTickStep
  ) {
    if (Math.round(v) % majorTickStep !== 0) minorTicks.push(v)
  }

  const degAt = (wpmValue: number) =>
    START_DEG + ((wpmValue - min) / (max - min)) * SWEEP_DEG

  function snap(raw: number) {
    return Math.round(raw / step) * step
  }

  function setFromAngle(deg: number) {
    let rel = (deg - START_DEG + 360) % 360
    if (rel > SWEEP_DEG) {
      rel = rel < SWEEP_DEG + GAP_DEG / 2 ? SWEEP_DEG : 0
    }
    const raw = min + (rel / SWEEP_DEG) * (max - min)
    onChange(Math.min(max, Math.max(min, snap(raw))))
  }

  function setFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let deg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI
    if (deg < 0) deg += 360
    setFromAngle(deg)
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    setFromClient(event.clientX, event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragging) return
    setFromClient(event.clientX, event.clientY)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-64 select-none sm:size-80">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          className="size-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(false)}
          role="slider"
          aria-label="Pace"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              onChange(Math.min(max, value + step))
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              onChange(Math.max(min, value - step))
            }
          }}
        >
          <defs>
            <radialGradient id={`${uid}-face`} cx="50%" cy="38%" r="75%">
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, white 4%, var(--color-card))"
              />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, black 45%, var(--color-card))"
              />
            </radialGradient>
            <radialGradient id={`${uid}-gloss`} cx="50%" cy="0%" r="65%">
              <stop offset="0%" stopColor="white" stopOpacity="0.18" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id={`${uid}-needle`}
              gradientUnits="userSpaceOnUse"
              x1={needleTail.x}
              y1={needleTail.y}
              x2={needleTip.x}
              y2={needleTip.y}
            >
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, black 35%, var(--color-destructive))"
              />
              <stop offset="65%" stopColor="var(--color-destructive)" />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, white 55%, var(--color-destructive))"
              />
            </linearGradient>
            <radialGradient id={`${uid}-hub`} cx="38%" cy="32%" r="70%">
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, white 45%, var(--color-muted-foreground))"
              />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, black 55%, var(--color-muted-foreground))"
              />
            </radialGradient>
            {/* A flat silvery ring, the way a real cluster bezel actually
                reads — lighter where the cabin light catches it up top,
                shading smoothly toward the lower edge. */}
            <linearGradient
              id={`${uid}-bezel`}
              x1="20%"
              y1="0%"
              x2="75%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor="color-mix(in oklab, white 55%, var(--color-muted-foreground))"
              />
              <stop
                offset="45%"
                stopColor="color-mix(in oklab, white 4%, var(--color-muted-foreground))"
              />
              <stop
                offset="100%"
                stopColor="color-mix(in oklab, black 35%, var(--color-muted-foreground))"
              />
            </linearGradient>
            <clipPath id={`${uid}-face-clip`}>
              <circle cx="50" cy="50" r={FACE_RADIUS} />
            </clipPath>
            <clipPath id={`${uid}-bezel-clip`}>
              <circle cx="50" cy="50" r={BEZEL_RADIUS} />
            </clipPath>
          </defs>

          <circle
            cx="50"
            cy="50"
            r={BEZEL_RADIUS}
            fill={`url(#${uid}-bezel)`}
            stroke="color-mix(in oklab, black 45%, var(--color-border))"
            strokeWidth="0.4"
          />
          {/* Knurled grip ring — the fine radial notches machined into a
              real gauge bezel so it can be gripped, not just decoration. */}
          <g clipPath={`url(#${uid}-bezel-clip)`} opacity="0.4">
            {Array.from({ length: KNURL_COUNT }, (_, i) => {
              const deg = (360 / KNURL_COUNT) * i
              const inner = polar(deg, BEZEL_RADIUS - 3.2)
              const outer = polar(deg, BEZEL_RADIUS + 1)
              return (
                <line
                  key={deg}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="black"
                  strokeWidth="0.35"
                  strokeOpacity="0.22"
                />
              )
            })}
          </g>
          <circle
            cx="50"
            cy="50"
            r={FACE_RADIUS}
            fill={`url(#${uid}-face)`}
            stroke="color-mix(in oklab, black 55%, var(--color-border))"
            strokeWidth="0.6"
          />
          <ellipse
            cx="50"
            cy="28"
            rx={FACE_RADIUS * 0.85}
            ry={FACE_RADIUS * 0.55}
            fill={`url(#${uid}-gloss)`}
            clipPath={`url(#${uid}-face-clip)`}
          />

          {warningFrom !== undefined && warningFrom <= max && (
            <path
              d={arcPath(
                degAt(warningFrom),
                START_DEG + SWEEP_DEG,
                RADIUS + 4.5,
              )}
              fill="none"
              stroke="var(--color-destructive)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
          )}

          <path
            d={trackPath}
            fill="none"
            stroke="var(--color-secondary)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Guarded at t <= 0: a zero-length dash with a round linecap
              still paints its caps, which renders as a stray filled disc
              at the far end of the path instead of nothing. */}
          {t > 0 && (
            <path
              d={trackPath}
              fill="none"
              stroke={fillColor}
              strokeWidth="7"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={100 - t * 100}
              style={{ transition: 'stroke 200ms ease' }}
            />
          )}

          {minorTicks.map((tickValue) => {
            const deg = degAt(tickValue)
            const inner = polar(deg, RADIUS - 4)
            const outer = polar(deg, RADIUS - 1)
            return (
              <line
                key={tickValue}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="var(--color-background)"
                strokeWidth="0.8"
                opacity="0.55"
              />
            )
          })}

          {majorTicks.map((tickValue) => {
            const deg = degAt(tickValue)
            const inner = polar(deg, RADIUS - 6)
            const outer = polar(deg, RADIUS - 1)
            const label = polar(deg, LABEL_RADIUS)
            return (
              <g key={tickValue}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="var(--color-background)"
                  strokeWidth="1.5"
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="5.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                  fill="var(--color-muted-foreground)"
                >
                  {tickValue}
                </text>
              </g>
            )
          })}

          {markerValue !== undefined &&
            markerValue >= min &&
            markerValue <= max && (
              <circle
                cx={polar(degAt(markerValue), RADIUS).x}
                cy={polar(degAt(markerValue), RADIUS).y}
                r="2.6"
                className="cursor-pointer"
                fill="var(--color-success)"
                onClick={(event) => {
                  event.stopPropagation()
                  onChange(snap(markerValue))
                }}
              >
                <title>Personal best · {markerValue} wpm</title>
              </circle>
            )}

          {/* No transition on `d`: the pedals can advance the value every
              70ms (faster than any tasteful sweep animation), which left the
              needle perpetually chasing a stale angle — visibly detached
              from the fill arc and ticks, which always render at the
              current value with no lag. Snapping keeps all three in sync. */}
          <path
            d={needlePath}
            fill={`url(#${uid}-needle)`}
            stroke="color-mix(in oklab, black 40%, var(--color-destructive))"
            strokeWidth="0.4"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.5))' }}
          />
          <circle
            cx="50"
            cy="50"
            r={HUB_RADIUS}
            fill={`url(#${uid}-hub)`}
            stroke="var(--color-border)"
            strokeWidth="0.5"
          />
          <circle
            cx="48.5"
            cy="48.5"
            r={HUB_RADIUS * 0.28}
            fill="white"
            opacity="0.35"
          />
        </svg>

        {/* Bare on the glass, not boxed — a real digital trip readout is
            printed straight onto the gauge face with no card behind it. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-1.5 pb-[13%]">
          <div className="flex flex-col items-center">
            <span
              className="stat-figure text-3xl leading-none transition-colors duration-200 sm:text-4xl"
              style={{
                color: fillColor,
                filter: `drop-shadow(0 0 6px color-mix(in oklab, ${fillColor} 45%, transparent))`,
              }}
            >
              {value}
            </span>
            <span className="mt-1 text-[0.55rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              wpm
            </span>
          </div>
        </div>
      </div>

      {zones.length > 0 && (
        <div className="rounded-md border border-border bg-background px-4 py-1.5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)]">
          <p className="font-mono text-xs font-bold tracking-widest text-primary uppercase">
            {zoneNameFor(zones, value)}
          </p>
        </div>
      )}
    </div>
  )
}
