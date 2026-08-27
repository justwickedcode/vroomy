import { useId } from 'react'
import type { CSSProperties } from 'react'

export type CarModel =
  | 'sport'
  | 'muscle'
  | 'classic'
  | 'super'
  | 'offroad'
  | 'drift'
  | 'rally'

export const CAR_MODELS: Array<{ id: CarModel; label: string }> = [
  { id: 'sport', label: 'Sport' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'classic', label: 'Classic' },
  { id: 'super', label: 'Super' },
  { id: 'offroad', label: 'Offroad' },
  { id: 'drift', label: 'Drift' },
  { id: 'rally', label: 'Rally' },
]

const GLASS = { top: '#7fd8ff', bottom: '#0b1a2b' }
const RIM = '#c6cbd4'
const HUB = '#050608'
const HEADLIGHT = '#fff3c4'
const TAILLIGHT = '#ff2d55'

// Every body below is drawn nose-right, tail-left, directly in those final
// coordinates (no runtime mirroring) — cars drive left-to-right along the
// track (start flag left, finish flag right), so the front must read
// unambiguously on the right: a tapered/angled nose, headlight on the
// right, taillight on the left, blunt vertical tail panel on the left.
// Bodies are mostly straight line segments with only a couple of curves
// (nose tip, bumper corner) — fewer control points means fewer ways for a
// silhouette to blob out at small icon sizes.

function Gradients({
  uid,
  glassTop = GLASS.top,
  glassBottom = GLASS.bottom,
}: {
  uid: string
  glassTop?: string
  glassBottom?: string
}) {
  return (
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.3" y2="1">
        <stop
          offset="0%"
          stopColor="color-mix(in oklab, var(--car-color) 55%, white)"
        />
        <stop offset="45%" stopColor="var(--car-color)" />
        <stop
          offset="100%"
          stopColor="color-mix(in oklab, var(--car-color) 65%, black)"
        />
      </linearGradient>
      <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={glassTop} />
        <stop offset="100%" stopColor={glassBottom} />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--car-color)" stopOpacity="0.55" />
        <stop offset="100%" stopColor="var(--car-color)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={HEADLIGHT} stopOpacity="0.7" />
        <stop offset="100%" stopColor={HEADLIGHT} stopOpacity="0" />
      </linearGradient>
    </defs>
  )
}

// A cone of light spilling out to the right of a headlight — light only
// ever shines forward, so this reads as "this end is the front" instantly
// and unambiguously, regardless of how subtle a given body's nose taper is
// at small icon sizes.
function HeadlightBeam({
  uid,
  x,
  y,
  length = 28,
  spread = 11,
}: {
  uid: string
  x: number
  y: number
  length?: number
  spread?: number
}) {
  return (
    <path
      d={`M${x},${y - spread * 0.45} L${x + length},${y - spread} L${x + length},${y + spread} L${x},${y + spread * 0.45} Z`}
      fill={`url(#${uid}-beam)`}
    />
  )
}

function Wheel({
  cx,
  cy = 108,
  r = 30,
}: {
  cx: number
  cy?: number
  r?: number
}) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.9} fill={HUB} />
      <ellipse
        cx={cx}
        cy={cy}
        rx={r * 0.63}
        ry={r * 0.57}
        fill="#7d8494"
        stroke={RIM}
        strokeWidth="1.5"
      />
      <ellipse cx={cx} cy={cy} rx={r * 0.2} ry={r * 0.18} fill={HUB} />
      <path
        d={`M${cx},${cy - r * 0.6} L${cx},${cy + r * 0.6} M${cx - r * 0.6},${cy} L${cx + r * 0.6},${cy} M${cx - r * 0.42},${cy - r * 0.42} L${cx + r * 0.42},${cy + r * 0.42} M${cx + r * 0.42},${cy - r * 0.42} L${cx - r * 0.42},${cy + r * 0.42}`}
        stroke={RIM}
        strokeWidth="2"
        opacity="0.7"
      />
    </>
  )
}

function SportBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} />
      <ellipse cx="120" cy="120" rx="95" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="120" cy="122" rx="70" ry="8" fill="black" opacity="0.5" />
      <path
        d="M20,108 C18,92 26,78 44,70 L70,44 C82,32 100,26 122,26 L168,28
           C186,29 200,36 208,48 L214,66 C218,76 216,88 206,96 L196,104
           C188,110 176,113 160,113 L46,113 C32,113 22,111 20,108 Z"
        fill={`url(#${uid}-body)`}
        stroke="#3a1608"
        strokeWidth="1.5"
      />
      <path
        d="M60,52 C90,34 130,29 172,32 L178,40 C136,38 96,44 68,60 Z"
        fill="white"
        opacity="0.35"
      />
      <path
        d="M76,66 L96,42 C106,34 118,30 132,30 L160,32
           C170,33 176,38 178,46 L150,66 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <Wheel cx={58} r={27} />
      <Wheel cx={176} r={30} />
      <HeadlightBeam uid={uid} x={213} y={52} length={24} />
      <ellipse cx="207" cy="52" rx="6" ry="8" fill={HEADLIGHT} />
      <rect x="17" y="96" width="6" height="13" rx="2.5" fill={TAILLIGHT} />
    </>
  )
}

// Long flat hood, short cabin set well back, blunt low tail — the
// silhouette a muscle car needs to read distinctly from the sport wedge
// above (which fuses hood+windshield into one continuous curve).
function MuscleBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} />
      <ellipse cx="122" cy="120" rx="106" ry="17" fill={`url(#${uid}-glow)`} />
      <ellipse cx="122" cy="122" rx="80" ry="9" fill="black" opacity="0.5" />
      <path
        d="M20,98 L20,84 L44,64 L50,32 L88,32 L94,64 L204,60 L222,78
           C224,84 223,90 219,96 L20,96 Z"
        fill={`url(#${uid}-body)`}
        stroke="#1a1230"
        strokeWidth="1.5"
      />
      <rect
        x="110"
        y="64"
        width="80"
        height="5"
        rx="1.5"
        fill="#f5f7fa"
        opacity="0.9"
      />
      <rect
        x="110"
        y="71"
        width="80"
        height="5"
        rx="1.5"
        fill="#f5f7fa"
        opacity="0.9"
      />
      <path
        d="M50,60 L54,36 L84,36 L88,60 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.9"
      />
      <Wheel cx={52} r={32} />
      <Wheel cx={196} r={32} />
      <HeadlightBeam uid={uid} x={221} y={84} length={17} />
      <ellipse cx="216" cy="84" rx="5" ry="8" fill={HEADLIGHT} />
      <rect x="17" y="86" width="6" height="12" rx="2.5" fill={TAILLIGHT} />
    </>
  )
}

function ClassicBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} glassTop="#ffe6a8" glassBottom="#2b220b" />
      <ellipse cx="120" cy="122" rx="92" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="120" cy="124" rx="70" ry="8" fill="black" opacity="0.5" />
      <path
        d="M20,108 C17,90 28,76 48,70 C58,50 78,32 106,27
           C130,23 156,24 176,30 C192,35 204,42 210,54
           L214,68 C217,78 215,90 204,98
           L194,105 C186,111 174,114 158,114
           L46,114 C32,114 22,111 20,108 Z"
        fill={`url(#${uid}-body)`}
        stroke="#3d2e00"
        strokeWidth="1.5"
      />
      <path
        d="M62,54 C82,36 108,28 138,27 L144,35 C116,36 92,43 70,60 Z"
        fill="white"
        opacity="0.3"
      />
      <path
        d="M78,70 L100,44 C108,36 118,32 128,31 L128,55 L86,63 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <path
        d="M132,31 C148,30.5 162,32.5 172,38 C180,42 186,48 189,55 L132,55 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <path
        d="M22,96 L40,94"
        stroke="#f2f4f7"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M196,98 L212,92"
        stroke="#f2f4f7"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <Wheel cx={54} r={26} />
      <Wheel cx={174} r={29} />
      <HeadlightBeam uid={uid} x={214} y={58} length={24} />
      <circle cx="207" cy="58" r="7" fill={HEADLIGHT} />
      <rect x="18" y="94" width="6" height="12" rx="2.5" fill={TAILLIGHT} />
    </>
  )
}

// Mid-engine supercar wedge: very low flat nose, a short low cabin, and a
// wing over the engine deck at the rear — the silhouette that reads
// unmistakably "Lamborghini" rather than just "fast sport car".
function SuperBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} glassTop="#8fe3ff" glassBottom="#081420" />
      <ellipse cx="118" cy="118" rx="104" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="118" cy="120" rx="80" ry="8" fill="black" opacity="0.55" />
      <path
        d="M18,96 L18,84 L36,54 L64,50 L88,52 L104,32 L128,32 L152,48
           L196,66 L218,84 C221,88 220,93 216,96 L18,96 Z"
        fill={`url(#${uid}-body)`}
        stroke="#1c1c1c"
        strokeWidth="1.5"
      />
      <path
        d="M94,50 L108,34 L124,34 L144,48 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <rect
        x="16"
        y="90"
        width="26"
        height="4"
        rx="1.5"
        fill="#0b0b0c"
        opacity="0.85"
      />
      <rect
        x="190"
        y="92"
        width="30"
        height="4"
        rx="1.5"
        fill="#0b0b0c"
        opacity="0.85"
      />
      <path d="M40,56 L50,24 L76,24 L62,54 Z" fill="#1c1c1c" />
      <Wheel cx={52} r={30} />
      <Wheel cx={178} r={32} />
      <HeadlightBeam uid={uid} x={217} y={77} length={22} />
      <path d="M200,76 L216,72 L216,78 L203,82 Z" fill={HEADLIGHT} />
      <rect x="16" y="86" width="6" height="10" rx="1.5" fill={TAILLIGHT} />
    </>
  )
}

// Boxy 4x4: upright glass, a flat roof carrying a rack, a front bull bar,
// and oversized wheels for extra ground clearance — deliberately geometric
// so it reads as a distinct silhouette class rather than a lifted sedan.
function OffroadBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} glassTop="#a9e6ff" glassBottom="#0c1c2b" />
      <ellipse cx="120" cy="126" rx="98" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="120" cy="128" rx="76" ry="8" fill="black" opacity="0.5" />
      <path
        d="M20,98 L20,66 L34,30 L170,28 L192,36 L206,62 L220,76
           C222,84 222,90 218,96 L20,98 Z"
        fill={`url(#${uid}-body)`}
        stroke="#14210f"
        strokeWidth="1.5"
      />
      <rect x="70" y="20" width="96" height="4" rx="2" fill="#22252b" />
      <rect x="90" y="13" width="4" height="8" rx="1.5" fill="#22252b" />
      <rect x="140" y="13" width="4" height="8" rx="1.5" fill="#22252b" />
      <path
        d="M38,64 L40,34 L166,32 L188,40 L198,60 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <rect x="206" y="78" width="16" height="18" rx="3" fill="#2a2c31" />
      <HeadlightBeam uid={uid} x={215} y={67.5} length={23} />
      <rect x="207" y="64" width="8" height="7" rx="1.5" fill={HEADLIGHT} />
      <rect x="20" y="70" width="7" height="11" rx="1.5" fill={TAILLIGHT} />
      <Wheel cx={54} r={36} />
      <Wheel cx={190} r={36} />
    </>
  )
}

// Low, wide JDM tuner build: flared fenders, a tall GT wing over the trunk,
// and a neon underglow strip — the "drift car" silhouette, distinct from
// the mid-engine Super above by sitting the wing over the REAR trunk
// (short overhang, long hood) rather than a mid-engine deck.
function DriftBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} glassTop="#9be8ff" glassBottom="#081420" />
      <ellipse cx="120" cy="118" rx="104" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="120" cy="120" rx="80" ry="8" fill="black" opacity="0.5" />
      <path
        d="M20,94 L20,82 L42,58 L66,38 L100,30 L150,30 L178,40 L202,56
           L220,74 C223,80 222,88 217,94 L20,94 Z"
        fill={`url(#${uid}-body)`}
        stroke="#0e1a24"
        strokeWidth="1.5"
      />
      <path
        d="M76,56 L96,36 L146,34 L168,48 L138,58 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <path d="M38,76 L54,66 L70,76 Z" fill="#10161c" opacity="0.9" />
      <path d="M172,74 L188,64 L204,74 Z" fill="#10161c" opacity="0.9" />
      <path d="M44,58 L52,24 L78,24 L64,54 Z" fill="#10161c" />
      <rect
        x="24"
        y="88"
        width="188"
        height="3"
        rx="1.5"
        fill={GLASS.top}
        opacity="0.85"
      />
      <Wheel cx={54} r={30} />
      <Wheel cx={188} r={32} />
      <HeadlightBeam uid={uid} x={219} y={66} length={20} />
      <ellipse cx="214" cy="66" rx="5" ry="8" fill={HEADLIGHT} />
      <rect x="17" y="80" width="6" height="10" rx="2.5" fill={TAILLIGHT} />
    </>
  )
}

// WRC-style rally sedan: raised stance for a sport wheel/tire combo, a
// hood scoop, twin auxiliary spotlights beside the headlight, and mud
// flaps trailing each wheel.
function RallyBody({ uid }: { uid: string }) {
  return (
    <>
      <Gradients uid={uid} glassTop="#bfeaff" glassBottom="#0c1c2b" />
      <ellipse cx="120" cy="120" rx="100" ry="16" fill={`url(#${uid}-glow)`} />
      <ellipse cx="120" cy="122" rx="76" ry="8" fill="black" opacity="0.5" />
      <path
        d="M20,92 L20,78 L38,56 L56,36 L86,30 L150,30 L172,38 L196,54
           L216,72 C219,78 218,86 213,92 L20,92 Z"
        fill={`url(#${uid}-body)`}
        stroke="#1a2712"
        strokeWidth="1.5"
      />
      <path
        d="M66,52 L86,34 L148,32 L168,44 L188,52 L150,56 Z"
        fill={`url(#${uid}-glass)`}
        opacity="0.92"
      />
      <path d="M116,30 L140,30 L136,24 L120,24 Z" fill="#20301a" />
      <rect x="34" y="84" width="10" height="16" rx="2" fill="#151a13" />
      <rect x="148" y="84" width="10" height="16" rx="2" fill="#151a13" />
      <Wheel cx={54} r={32} />
      <Wheel cx={186} r={33} />
      <HeadlightBeam uid={uid} x={213} y={61.5} length={23} />
      <rect x="205" y="58" width="8" height="7" rx="1.5" fill={HEADLIGHT} />
      <circle cx="203" cy="70" r="4" fill={HEADLIGHT} />
      <circle cx="203" cy="80" r="4" fill={HEADLIGHT} />
      <rect x="17" y="74" width="6" height="12" rx="2.5" fill={TAILLIGHT} />
    </>
  )
}

const BODIES: Record<CarModel, (props: { uid: string }) => React.ReactNode> = {
  sport: SportBody,
  muscle: MuscleBody,
  classic: ClassicBody,
  super: SuperBody,
  offroad: OffroadBody,
  drift: DriftBody,
  rally: RallyBody,
}

export default function CarIcon({
  className,
  color,
  model = 'sport',
  style,
}: {
  className?: string
  color: string
  model?: CarModel
  style?: CSSProperties
}) {
  const uid = useId()
  const Body = BODIES[model]
  return (
    <svg
      viewBox="0 0 240 150"
      className={className}
      aria-hidden="true"
      style={{
        overflow: 'visible',
        ['--car-color' as string]: color,
        ...style,
      }}
    >
      <Body uid={uid} />
    </svg>
  )
}
