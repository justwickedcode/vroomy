import type { CSSProperties } from 'react'

// A pixel-art synthwave backdrop for the dashboard's title-screen track, built as parallax
// layers so the city moves with the road instead of sitting behind it like a poster:
//
//   sky + sun   — static (infinitely far away)
//   far city    — drifts at 15% of road speed
//   near city   — 35% of road speed, with lit windows
//   street      — exactly road speed: the sidewalk, neon kerb and streetlights right next to the
//                 track, so the street edge is locked to the road below it (the track's light
//                 pools line up with these lamps — see .race-track-panel--epic in styles.css)
//
// The moving layers are repeating SVG tiles used as CSS backgrounds, positioned from the track's
// own --road-pos (set every frame by RaceTrack), so they wrap forever with no JS of their own.
// Everything is generated from fixed seeds — the same city every time.

const W = 320
const H = 64
// Street level at the bottom: a dark sidewalk the buildings and streetlights stand on, in the
// same colour as the track's barrier right below it, so the city and the road share one ground.
const GROUND = 5
const STREET = '#15101f'
// One streetlight every this many pixels along the sidewalk (W is a multiple, so tiles seam).
const LIGHT_SPACING = 40

// Small deterministic PRNG (mulberry32) so the skyline is identical on server and client.
function rng(seed: number) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// Sunset bands, top to bottom.
const SKY = [
  '#1a0b2e',
  '#2b0f45',
  '#4a1358',
  '#7a1d63',
  '#b3305c',
  '#e0584b',
  '#f59145',
]

function rect(x: number, y: number, w: number, h: number, fill: string) {
  return `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`
}

// A row of buildings standing on the sidewalk, as SVG rects (windows optional).
function cityRects(
  seed: number,
  minH: number,
  maxH: number,
  body: string,
  windowChance: number,
) {
  const next = rng(seed)
  const parts: Array<string> = []
  let x = 0
  while (x < W) {
    const w = Math.min(6 + Math.floor(next() * 12), W - x)
    const h = minH + Math.floor(next() * (maxH - minH))
    const top = H - GROUND - h
    parts.push(rect(x, top, w, h, body))
    for (let wy = top + 3; wy < H - GROUND - 2; wy += 3) {
      for (let wx = x + 2; wx < x + w - 1; wx += 3) {
        if (next() < windowChance) parts.push(rect(wx, wy, 1, 1, '#ffcf5a'))
      }
    }
    x += w + (next() < 0.3 ? 1 : 0)
  }
  return parts.join('')
}

function streetRects() {
  const parts = [
    rect(0, H - GROUND, W, GROUND, STREET),
    rect(0, H - GROUND, W, 1, '#ff2fb4'),
  ]
  for (let x = 18; x < W; x += LIGHT_SPACING) {
    const top = H - GROUND - 14
    parts.push(rect(x, top, 1, 14, '#3a2a4f'))
    parts.push(rect(x, top, 4, 1, '#3a2a4f'))
    parts.push(rect(x + 2, top - 1, 3, 3, 'rgba(34,211,238,0.3)'))
    parts.push(rect(x + 3, top + 1, 1, 1, '#a5f3fc'))
  }
  return parts.join('')
}

function tile(body: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' shape-rendering='crispEdges'>${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const FAR_TILE = tile(cityRects(7, 14, 34, '#2a1240', 0))
const NEAR_TILE = tile(cityRects(42, 8, 26, '#12081f', 0.22))
const STREET_TILE = tile(streetRects())

// Stars scattered over the dark upper sky; every fifth one twinkles.
const STARS: Array<[number, number, boolean]> = []
{
  const next = rng(99)
  for (let i = 0; i < 46; i++) {
    STARS.push([Math.floor(next() * W), Math.floor(next() * 22), i % 5 === 0])
  }
}

// The sun: a pixel disc centred on the horizon, cut by widening horizontal gaps toward its base.
const SUN: Array<[number, number, number]> = []
{
  const cx = 230
  const cy = 52
  const r = 22
  for (let y = cy - r; y <= cy; y++) {
    const dy = cy - y
    // Synthwave stripes: skip rows in the lower half, more often the lower they are.
    if (dy < 12 && dy % 3 === 0) continue
    const half = Math.floor(Math.sqrt(r * r - dy * dy))
    SUN.push([cx - half, y, half * 2])
  }
}

function layer(image: string, speed: number): CSSProperties {
  return {
    backgroundImage: image,
    backgroundRepeat: 'repeat-x',
    backgroundSize: 'auto 100%',
    backgroundPositionX: `calc(var(--road-pos, 0px) * ${-speed})`,
    imageRendering: 'pixelated',
  }
}

export default function PixelSkyline() {
  const band = H / SKY.length
  return (
    <div className="relative h-28 overflow-hidden sm:h-36" aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        shapeRendering="crispEdges"
        className="absolute inset-0 h-full w-full"
      >
        {SKY.map((color, i) => (
          <rect
            key={color}
            x={0}
            y={Math.floor(i * band)}
            width={W}
            height={Math.ceil(band) + 1}
            fill={color}
          />
        ))}
        {STARS.map(([x, y, twinkle]) => (
          <rect
            key={`${x},${y}`}
            x={x}
            y={y}
            width={1}
            height={1}
            fill="#fff3e0"
            fillOpacity={0.75}
            className={twinkle ? 'sky-twinkle' : undefined}
          />
        ))}
        {SUN.map(([x, y, w]) => (
          <rect key={y} x={x} y={y} width={w} height={1} fill="#ffd166" />
        ))}
      </svg>
      <div className="absolute inset-0" style={layer(FAR_TILE, 0.15)} />
      <div className="absolute inset-0" style={layer(NEAR_TILE, 0.35)} />
      <div className="absolute inset-0" style={layer(STREET_TILE, 1)} />
    </div>
  )
}
