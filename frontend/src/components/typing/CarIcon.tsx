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
// A wider roster (tanks/trucks/spaceships from Kenney's CC0 packs) was tried twice and reverted
// both times (see git history) — direct feedback was that the flat-shaded/low-poly look reads as
// noticeably lower effort next to this pack's own painterly shading ("way too simple... slop").
// Sourcing more vehicles in a *matching* style is still an open TODO; until then the roster stays
// these 7 rather than adding variety at the cost of visibly inconsistent quality.
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
  underglowColor,
  style,
}: {
  className?: string
  color: string
  model?: CarModel
  underglow?: boolean
  // Independently selectable (see Garage's Underglow section) — falls back to the paint color
  // only if a caller doesn't pass one at all.
  underglowColor?: string
  style?: CSSProperties
}) {
  const src = spriteSrc(model)
  const aspect = (VEHICLE_BY_ID[model] ?? VEHICLES[0]).aspect
  const glowColor = underglowColor ?? color

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
            background: `radial-gradient(ellipse at center, ${glowColor}88 0%, transparent 70%)`,
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
      {/* Recolors the sprite while keeping its own per-pixel shading (highlights/shadows) intact:
          mix-blend-mode "color" takes this layer's hue+saturation but the *image's own*
          lightness at each pixel. Went through "hue" blend first (see git history) — it takes
          the backdrop's own saturation too, which looks great on painterly sprites that already
          have color variation, but does nothing at all on a flat white/gray sprite (0 backdrop
          saturation stays 0 no matter what hue you apply) — exactly the sci-fi/space sprites
          added for the Military/Aircraft categories. "color" recolors those too, since it
          supplies the saturation itself rather than reading it from the backdrop. */}
      <div
        aria-hidden="true"
        style={{
          ...maskStyle,
          backgroundColor: color,
          mixBlendMode: 'color',
        }}
      />
    </div>
  )
}
