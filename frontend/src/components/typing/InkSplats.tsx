import type { CSSProperties } from 'react'

// Ink Bomb's hit on your screen: chunky pixel ink blots slapped over the words, which then drip
// and fade (see .race-ink in styles.css). Fixed positions, so it's the same mess every time.
const SPLATS = [
  { x: 8, y: 18, s: 1.2, d: 0 },
  { x: 34, y: 52, s: 1.6, d: 90 },
  { x: 58, y: 12, s: 1, d: 180 },
  { x: 76, y: 46, s: 1.4, d: 60 },
  { x: 20, y: 70, s: 0.9, d: 240 },
  { x: 88, y: 14, s: 0.8, d: 150 },
]

export default function InkSplats() {
  return (
    <div className="race-ink" aria-hidden="true">
      {SPLATS.map((splat) => (
        <span
          key={`${splat.x}-${splat.y}`}
          style={
            {
              left: `${splat.x}%`,
              top: `${splat.y}%`,
              '--s': splat.s,
              animationDelay: `${splat.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
