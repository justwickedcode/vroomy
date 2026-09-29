import type { CSSProperties } from 'react'

// Was a fixed 7-entry union back when there were only 7 hand-picked models; now the roster is a
// data-driven catalog (see VEHICLES below) so this is just `string`. Kept as a distinct type name
// (rather than switching every consumer to `string` directly) purely so call sites/imports don't
// need to change.
export type CarModel = string

interface Vehicle {
  id: CarModel
  label: string
  // Sprite's own native pixel aspect ratio (width:height) — used so the <img> never gets
  // stretched off-model inside a consumer's aspect-[8/5] wrapper, which was tuned for the old
  // hand-drawn SVG's fixed 240x150 viewBox, not these varying real sprite dimensions.
  aspect: number
  // Name of the achievement (see #/lib/achievements) that unlocks this model — undefined means
  // it's available from the start. Checked by the Garage page against the player's own stats.
  requiresAchievement?: string
}

// Real top-down car sprites (tokka's "Top Down Cars Sprite Pack 1.0" on itch.io — free for free
// and commercial projects) rather than hand-drawn SVG bodies: the hand-drawn attempt (see git
// history) never got past looking like a soft rounded blob at this icon size no matter how the
// path math was tuned, where these read as actual cars immediately.
//
// A wider "tanks/trucks, way more variety" roster was tried and reverted (see git history) —
// mixing this pack's realistic painterly shading with a flat-shaded cartoon pack (Kenney's
// Racing/Tanks packs) read as visibly inconsistent side by side, so the roster stays a single
// consistent art style rather than max quantity.
export const VEHICLES: Array<Vehicle> = [
  // No requiresAchievement — the starter car, always available.
  { id: 'sport', label: 'Sport', aspect: 95 / 55 },
  {
    id: 'muscle',
    label: 'Muscle',
    aspect: 89 / 48,
    requiresAchievement: 'First lap',
  },
  {
    id: 'classic',
    label: 'Classic',
    aspect: 102 / 54,
    requiresAchievement: 'Getting warmed up',
  },
  {
    id: 'offroad',
    label: 'Offroad',
    aspect: 94 / 50,
    requiresAchievement: 'On the podium',
  },
  {
    id: 'drift',
    label: 'Drift',
    aspect: 106 / 58,
    requiresAchievement: 'Speed demon',
  },
  {
    id: 'rally',
    label: 'Rally',
    aspect: 96 / 51,
    requiresAchievement: 'Checkered flag',
  },
  {
    id: 'super',
    label: 'Super',
    aspect: 99 / 54,
    requiresAchievement: 'Century club',
  },
]

// The achievement (see #/lib/achievements) that unlocks underglow — matches its "neon glow"
// theming rather than a milestone tied to a specific model.
export const UNDERGLOW_ACHIEVEMENT = 'Nitro boost'

const VEHICLE_BY_ID: Record<string, Vehicle | undefined> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
)

// Back-compat alias: every consumer that just wants {id, label} pairs (bot/opponent model
// cycling, the old flat picker) keeps working against this unchanged.
export const CAR_MODELS: Array<{ id: CarModel; label: string }> = VEHICLES.map(
  ({ id, label }) => ({ id, label }),
)

function spriteSrc(model: CarModel): string {
  return `/cars/${model}.png`
}

export default function CarIcon({
  className,
  color,
  model = 'sport',
  underglow = false,
  style,
}: {
  className?: string
  color: string
  model?: CarModel
  // On/off only — when equipped, the glow always matches the car's own paint color rather than
  // a separate palette, so every one of the 8 paint colors gets a matching glow for free instead
  // of picking from a handful of preset glow colors.
  underglow?: boolean
  style?: CSSProperties
}) {
  const src = spriteSrc(model)
  const aspect = (VEHICLE_BY_ID[model] ?? VEHICLES[0]).aspect

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
      {underglow && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-18%',
            borderRadius: '9999px',
            background: `radial-gradient(ellipse at center, ${color}88 0%, transparent 70%)`,
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
    </div>
  )
}
