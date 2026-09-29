import type { CSSProperties } from 'react'

// Was a fixed 7-entry union back when there were only 7 hand-picked models; now the roster is a
// data-driven catalog (see VEHICLES below) so this is just `string`. Kept as a distinct type name
// (rather than switching every consumer to `string` directly) purely so call sites/imports don't
// need to change.
export type CarModel = string

export type VehicleCategory = 'Cars' | 'Fleet'

export const VEHICLE_CATEGORIES: Array<VehicleCategory> = ['Cars', 'Fleet']

interface Vehicle {
  id: CarModel
  label: string
  category: VehicleCategory
  // Sprite's own native pixel aspect ratio (width:height) — used so the <img> never gets
  // stretched off-model inside a consumer's aspect-[8/5] wrapper, which was tuned for the old
  // hand-drawn SVG's fixed 240x150 viewBox, not these varying real sprite dimensions.
  aspect: number
  // Name of the achievement (see #/lib/achievements) that unlocks this model — undefined means
  // it's available from the start. Checked by the Garage page against the player's own stats.
  requiresAchievement?: string
}

// Real top-down car sprites — all 14 from tokka's "Top Down Cars Sprite Pack 1.0" on itch.io
// (free for free and commercial projects), rather than hand-drawn SVG bodies: the hand-drawn
// attempt (see git history) never got past looking like a soft rounded blob at this icon size no
// matter how the path math was tuned, where these read as actual cars immediately.
//
// A wider roster from other CC0 packs (Kenney's tanks/trucks/spaceships, twice) was tried and
// reverted both times — direct feedback was that a flat-shaded/low-poly look reads as noticeably
// lower effort next to this pack's own painterly shading ("way too simple... slop"). The Fleet
// vehicles below solve "more variety" a different way: same sheet, same artist, same rendering
// technique as the original 7 — zero style-consistency risk, since it's the same pack, just more
// of it (extracted straight from the pack's own full sheet, not its rotated marketing screenshot).
export const VEHICLES: Array<Vehicle> = [
  // Cars — the original realistic-car lineup.
  // No requiresAchievement — the starter car, always available.
  { id: 'sport', label: 'Sport', category: 'Cars', aspect: 95 / 55 },
  {
    id: 'muscle',
    label: 'Muscle',
    category: 'Cars',
    aspect: 89 / 48,
    requiresAchievement: 'First lap',
  },
  {
    id: 'classic',
    label: 'Classic',
    category: 'Cars',
    aspect: 102 / 54,
    requiresAchievement: 'Getting warmed up',
  },
  {
    id: 'offroad',
    label: 'Offroad',
    category: 'Cars',
    aspect: 94 / 50,
    requiresAchievement: 'On the podium',
  },
  {
    id: 'drift',
    label: 'Drift',
    category: 'Cars',
    aspect: 106 / 58,
    requiresAchievement: 'Speed demon',
  },
  {
    id: 'rally',
    label: 'Rally',
    category: 'Cars',
    aspect: 96 / 51,
    requiresAchievement: 'Checkered flag',
  },
  {
    id: 'super',
    label: 'Super',
    category: 'Cars',
    aspect: 99 / 54,
    requiresAchievement: 'Century club',
  },
  // Fleet — service/utility vehicles, same pack. Taxi is this category's free starter.
  { id: 'taxi', label: 'Taxi', category: 'Fleet', aspect: 99 / 51 },
  {
    id: 'van',
    label: 'Van',
    category: 'Fleet',
    aspect: 103 / 55,
    requiresAchievement: 'Highway cruiser',
  },
  {
    id: 'suv',
    label: 'SUV',
    category: 'Fleet',
    aspect: 103 / 55,
    requiresAchievement: 'Turbocharged',
  },
  {
    id: 'limo',
    label: 'Limo',
    category: 'Fleet',
    aspect: 135 / 52,
    requiresAchievement: 'Sharpshooter',
  },
  {
    id: 'police',
    label: 'Police Cruiser',
    category: 'Fleet',
    aspect: 93 / 48,
    requiresAchievement: 'Giant slayer',
  },
  {
    id: 'ambulance',
    label: 'Ambulance',
    category: 'Fleet',
    aspect: 97 / 48,
    requiresAchievement: 'Flawless streak',
  },
  {
    id: 'firetruck',
    label: 'Fire Truck',
    category: 'Fleet',
    aspect: 137 / 60,
    requiresAchievement: 'Win streak',
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

// Cars render in their own sprite's native paint job — no dynamic recolor. An earlier version
// tinted every sprite to the player's chosen paint color via a mix-blend-mode overlay, but that
// meant a sprite's own look was only ever a starting point, and results varied a lot depending on
// how light/dark/saturated that particular sprite's base pixels happened to be (a near-black
// sprite like the SUV stayed muddy-dark no matter the chosen color, a near-white one like the
// ambulance stayed pale) — inconsistent enough across the roster that it read as broken rather
// than customized. Color is reserved for underglow now, which is a color the player is adding
// (a glow layered behind the car), not one it's trying to reproduce faithfully.
export default function CarIcon({
  className,
  model = 'sport',
  underglow = false,
  underglowColor = '#7cf6ff',
  style,
}: {
  className?: string
  model?: CarModel
  underglow?: boolean
  underglowColor?: string
  style?: CSSProperties
}) {
  const src = spriteSrc(model)
  const aspect = (VEHICLE_BY_ID[model] ?? VEHICLES[0]).aspect

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
    </div>
  )
}
