import { UPGRADES } from '#/lib/upgrades'
import type { LiveryId } from '#/lib/liveries'
import type { UpgradeSlot } from '#/lib/upgrades'
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

// Real top-down car sprites (tokka's "Top Down Cars Sprite Pack 1.0" on itch.io — free for free
// and commercial projects) rather than hand-drawn SVG bodies: the hand-drawn attempt (see git
// history) never got past looking like a soft rounded blob at this icon size no matter how the
// path math was tuned, where these read as actual cars immediately. Cropped to one sprite per
// model (public/cars/<model>.png), rotated so the nose points right — cars still drive
// left-to-right along the track, same convention the old side-view art used, so nothing that
// positions/animates CarIcon (RaceTrack's Lane, the garage preview track, the dashboard hero)
// needed to change.
const SPRITES: Record<CarModel, string> = {
  sport: '/cars/sport.png',
  muscle: '/cars/muscle.png',
  classic: '/cars/classic.png',
  super: '/cars/super.png',
  offroad: '/cars/offroad.png',
  drift: '/cars/drift.png',
  rally: '/cars/rally.png',
}

// Each sprite's own native pixel aspect ratio (width:height) — used so the <img> never gets
// stretched off-model inside a consumer's aspect-[8/5] wrapper, which was tuned for the old
// hand-drawn SVG's fixed 240x150 viewBox, not these varying real sprite dimensions.
const ASPECT: Record<CarModel, number> = {
  sport: 95 / 55,
  muscle: 89 / 48,
  classic: 102 / 54,
  super: 99 / 54,
  offroad: 94 / 50,
  drift: 106 / 58,
  rally: 96 / 51,
}

export default function CarIcon({
  className,
  color,
  model = 'sport',
  livery = 'solid',
  upgrades,
  style,
}: {
  className?: string
  color: string
  model?: CarModel
  livery?: LiveryId
  upgrades?: Partial<Record<UpgradeSlot, string>>
  style?: CSSProperties
}) {
  const src = SPRITES[model]
  const aspect = ASPECT[model]
  const underglowColor = upgrades?.underglow
    ? UPGRADES.find((u) => u.id === upgrades.underglow)?.color
    : undefined

  const maskStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: aspect,
        ...style,
      }}
    >
      {underglowColor && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-18%',
            borderRadius: '9999px',
            background: `radial-gradient(ellipse at center, ${underglowColor}88 0%, transparent 70%)`,
          }}
        />
      )}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          imageRendering: 'pixelated',
        }}
      />
      {/* Recolors the sprite while keeping every bit of its own shading/highlights/window
          tint intact: mix-blend-mode "hue" takes this layer's hue but the *image's own*
          saturation and lightness at each pixel — so an already-neutral area (black tires,
          tinted glass) stays neutral instead of the whole car flattening to one tone the way
          a sepia+hue-rotate filter did on the first attempt, and a highlight stays a highlight
          instead of being overwritten. */}
      <div
        aria-hidden="true"
        style={{
          ...maskStyle,
          backgroundColor: color,
          mixBlendMode: 'hue',
        }}
      />
      {livery !== 'solid' && (
        <div aria-hidden="true" style={maskStyle}>
          <LiveryPattern livery={livery} />
        </div>
      )}
    </div>
  )
}

// Rendered inside a div masked to the sprite's own alpha shape (see above), so a livery pattern
// always stays confined to whichever car is currently selected without needing per-model outline
// data the way the old SVG clip-path approach did.
function LiveryPattern({ livery }: { livery: LiveryId }) {
  switch (livery) {
    case 'stripes':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(90deg, transparent 0 40%, #f5f5f5e0 40% 48%, transparent 48% 52%, #f5f5f5e0 52% 60%, transparent 60% 100%)',
          }}
        />
      )
    case 'checkered':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.55,
            backgroundImage:
              'linear-gradient(45deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111), linear-gradient(45deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111)',
            backgroundSize: '10px 10px',
            backgroundPosition: '0 0, 5px 5px',
            backgroundColor: '#f5f5f5',
          }}
        />
      )
    case 'camo':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.8,
            background:
              'radial-gradient(circle at 20% 30%, #3f4a2b 0 18%, transparent 19%), radial-gradient(circle at 70% 20%, #57652f 0 22%, transparent 23%), radial-gradient(circle at 30% 75%, #2e3a22 0 20%, transparent 21%), radial-gradient(circle at 80% 70%, #4a5730 0 18%, transparent 19%)',
          }}
        />
      )
    case 'carbon':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.85,
            backgroundImage:
              'repeating-linear-gradient(45deg, #15171c 0 4px, #22242b 4px 8px)',
          }}
        />
      )
    case 'fade':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, #050608 0%, #050608dd 45%, transparent 70%)',
          }}
        />
      )
    default:
      return null
  }
}
