// The visual effect trailing off the back of the player's own car during a race (see
// RaceTrack.tsx's Trail component) — a cosmetic, bought in the Garage (see #/lib/shop).
export type TrailVariant = 'nitro' | 'orbs' | 'smoke' | 'stars' | 'rainbow'

export const DEFAULT_TRAIL: TrailVariant = 'nitro'

// A saved profile can still name a trail that no longer exists (Thunderbolt and Shockwave were
// retired); those fall back to the free default rather than rendering nothing.
export function toTrailVariant(id: string): TrailVariant {
  return TRAILS.some((t) => t.id === id) ? (id as TrailVariant) : DEFAULT_TRAIL
}

export interface TrailDef {
  id: TrailVariant
  label: string
}

export const TRAILS: Array<TrailDef> = [
  { id: 'nitro', label: 'Nitro blast' },
  { id: 'orbs', label: 'Ember trail' },
  { id: 'smoke', label: 'Smoke blast' },
  { id: 'stars', label: 'Meteor shower' },
  { id: 'rainbow', label: 'Plasma bolt' },
]
