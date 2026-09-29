// Cosmetic car upgrades bought with race-earned credits (see creditsForRace and useProfile's
// buyUpgrade/equipUpgrade) — the "Upgrades" nav destination.
//
// Only one slot for now: underglow. CarIcon moved from hand-drawn SVG bodies to real raster car
// sprites (see its own comment for why), and a raster image can't have an individual part like
// rims or a spoiler recolored/swapped in isolation the way an SVG's own path elements could —
// there's no per-model wheel/rear-bumper position data for these sprites to attach anything to.
// Underglow survives that move fine: it's a glow rendered as its own layer behind the sprite,
// not a change to the sprite itself, so it doesn't need any per-model attachment data at all.
export type UpgradeSlot = 'underglow'

export interface UpgradeOption {
  id: string
  slot: UpgradeSlot
  label: string
  detail: string
  cost: number
  /** The glow's own color — only meaningful for the underglow slot right now. */
  color: string
}

export const UPGRADES: Array<UpgradeOption> = [
  {
    id: 'underglow-cyan',
    slot: 'underglow',
    label: 'Cyan underglow',
    detail: 'A cool neon strip under the car.',
    cost: 250,
    color: '#7cf6ff',
  },
  {
    id: 'underglow-magenta',
    slot: 'underglow',
    label: 'Magenta underglow',
    detail: 'A hot pink neon strip under the car.',
    cost: 300,
    color: '#ff5fd8',
  },
  {
    id: 'underglow-lime',
    slot: 'underglow',
    label: 'Lime underglow',
    detail: 'An acid-green neon strip under the car.',
    cost: 300,
    color: '#a8ff3f',
  },
  {
    id: 'underglow-amber',
    slot: 'underglow',
    label: 'Amber underglow',
    detail: 'A warm amber neon strip under the car.',
    cost: 350,
    color: '#ffb347',
  },
]

// Small, race-length-scaled payout — rewards both speed and placement without needing real
// balancing data yet: roughly 10-50 credits per race depending on performance. Every race mode
// (solo, multiplayer, daily challenge) already funnels through useProfile's addRace, so this one
// formula covers all of them with no per-mode wiring.
export function creditsForRace(wpm: number, placement: number): number {
  return Math.round(wpm / 5) + (placement === 1 ? 20 : placement <= 3 ? 10 : 0)
}
