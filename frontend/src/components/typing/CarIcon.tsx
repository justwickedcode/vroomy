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
  // Prices live in the shop catalog (#/lib/shop/prices.json), not here.
  { id: 'sport', label: 'Sport', aspect: 95 / 55 },
  {
    id: 'muscle',
    label: 'Muscle',
    aspect: 89 / 48,
  },
  {
    id: 'classic',
    label: 'Classic',
    aspect: 102 / 54,
  },
  {
    id: 'offroad',
    label: 'Offroad',
    aspect: 94 / 50,
  },
  {
    id: 'drift',
    label: 'Drift',
    aspect: 106 / 58,
  },
  {
    id: 'rally',
    label: 'Rally',
    aspect: 86 / 45,
  },
  {
    id: 'super',
    label: 'Super',
    aspect: 99 / 54,
  },
  {
    id: 'lambo',
    label: 'Lambo',
    aspect: 260 / 130,
  },
  {
    id: 'convertible',
    label: 'Convertible',
    aspect: 260 / 132,
  },
  {
    id: 'wedge',
    label: 'Wedge',
    aspect: 260 / 132,
  },
  {
    id: 'hot-hatch',
    label: 'Hot Hatch',
    aspect: 260 / 132,
  },
  // The rest of the achievement pool (see #/lib/achievements) is already spoken for by other
  // vehicles/trails/underglow, so these three — from looneybits' "2D Sport Cars" (CC BY 4.0,
  // attribution required) — ship as free starters rather than reusing a name.
  { id: 'roadster', label: 'Speedster', aspect: 260 / 129 },
  { id: 'coupe-gt', label: 'Coupe GT', aspect: 260 / 124 },
  { id: 'coupe-white', label: 'Coupe White', aspect: 260 / 124 },
  // Service/utility vehicles from the same pack.
  { id: 'taxi', label: 'Taxi', aspect: 99 / 51 },
  {
    id: 'van',
    label: 'Van',
    aspect: 103 / 55,
  },
  {
    id: 'suv',
    label: 'SUV',
    aspect: 135 / 52,
  },
  {
    id: 'limo',
    label: 'Limo',
    aspect: 135 / 52,
  },
  {
    id: 'police',
    label: 'Police Cruiser',
    aspect: 93 / 48,
  },
  {
    id: 'ambulance',
    label: 'Ambulance',
    aspect: 97 / 48,
  },
  {
    id: 'firetruck',
    label: 'Fire Truck',
    aspect: 137 / 60,
  },
  // Chunky pixel art from two more free/permissively-licensed itch.io packs (marcusvh's "2D Top
  // Down Pixel Art Car Pack" and Aim Studios' "Top down pixel art Race cars"). (The pack's semi
  // trailer was dropped — a flatbed with no cab attached doesn't read as a vehicle on its own.)
  { id: 'pixel-compact', label: 'Compact', aspect: 58 / 26 },
  {
    id: 'pixel-coupe',
    label: 'Coupe',
    aspect: 75 / 29,
  },
  { id: 'pixel-sedan', label: 'Sedan', aspect: 78 / 30 },
  {
    id: 'pixel-sport',
    label: 'Roadster',
    aspect: 71 / 31,
  },
  {
    id: 'pixel-racer-blue',
    label: 'Blue Racer',
    aspect: 280 / 142,
  },
  {
    id: 'pixel-racer-red',
    label: 'Red Racer',
    aspect: 280 / 142,
  },
  {
    id: 'pixel-buggy-neon',
    label: 'Neon Buggy',
    aspect: 239 / 132,
  },
  {
    id: 'pixel-buggy-woods',
    label: 'Forest Buggy',
    aspect: 239 / 132,
  },
]

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
  // Falls back to the roster's first vehicle when `model` doesn't match a current entry — e.g.
  // a profile still pointing at a model that's since been removed from the catalog — so this
  // renders a valid sprite instead of a broken image.
  const vehicle = VEHICLE_BY_ID[model] ?? VEHICLES[0]
  const src = spriteSrc(vehicle.id)
  const rawAspect = vehicle.aspect
  // Clamped, not used as-is: a caller sizing this by a fixed width (every picker card, the
  // garage/dashboard preview) derives height from this aspect ratio, so an unusually
  // portrait-or-narrow sprite — the gunship's wingspan becomes its vertical dimension once
  // rotated to face right — would blow up its own container far taller than every other
  // vehicle's card. objectFit "contain" on the <img> below already letterboxes any real
  // mismatch between this box and the sprite's own shape without distorting it, so clamping
  // here only affects layout size, never how the sprite itself renders.
  const aspect = Math.min(Math.max(rawAspect, 1.3), 2.6)

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
            inset: '-28%',
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
