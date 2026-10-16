// A pixel-art synthwave backdrop for the dashboard's title-screen track: stepped sunset bands,
// a big striped sun, and two layers of city silhouettes with lit windows. Everything is drawn on
// a coarse grid with crisp edges, so it reads as sprite art at any width. The city is generated
// from a fixed seed — the same skyline every time, no randomness at render.

const W = 320
const H = 64

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

interface Building {
  x: number
  w: number
  h: number
  windows: Array<[number, number]>
}

function city(seed: number, minH: number, maxH: number, windowChance: number) {
  const next = rng(seed)
  const buildings: Array<Building> = []
  let x = -2
  while (x < W) {
    const w = 6 + Math.floor(next() * 12)
    const h = minH + Math.floor(next() * (maxH - minH))
    const windows: Array<[number, number]> = []
    for (let wy = H - h + 3; wy < H - 2; wy += 3) {
      for (let wx = x + 2; wx < x + w - 1; wx += 3) {
        if (next() < windowChance) windows.push([wx, wy])
      }
    }
    buildings.push({ x, w, h, windows })
    x += w + (next() < 0.3 ? 1 : 0)
  }
  return buildings
}

const FAR = city(7, 14, 34, 0)
const NEAR = city(42, 8, 26, 0.22)

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

export default function PixelSkyline() {
  const band = H / SKY.length
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className="block h-28 w-full sm:h-36"
      aria-hidden="true"
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
      {SUN.map(([x, y, w]) => (
        <rect key={y} x={x} y={y} width={w} height={1} fill="#ffd166" />
      ))}
      {FAR.map((b) => (
        <rect
          key={`f${b.x}`}
          x={b.x}
          y={H - b.h}
          width={b.w}
          height={b.h}
          fill="#2a1240"
        />
      ))}
      {NEAR.map((b) => (
        <g key={`n${b.x}`}>
          <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill="#12081f" />
          {b.windows.map(([wx, wy]) => (
            <rect
              key={`${wx},${wy}`}
              x={wx}
              y={wy}
              width={1}
              height={1}
              fill="#ffcf5a"
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
