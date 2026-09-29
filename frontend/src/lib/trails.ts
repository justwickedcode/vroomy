// The visual effect trailing off the back of the player's own car during a race (see
// RaceTrack.tsx's Trail component) — a cosmetic pick. requiresAchievement is kept on each entry
// for when unlocking comes back (everything is unlocked for now — see Garage), so re-enabling
// later is just restoring the check, not re-deriving these.
export type TrailVariant =
  | 'nitro'
  | 'orbs'
  | 'smoke'
  | 'spark'
  | 'bubbles'
  | 'stars'
  | 'rainbow'

export interface TrailDef {
  id: TrailVariant
  label: string
  requiresAchievement?: string
}

export const TRAILS: Array<TrailDef> = [
  { id: 'nitro', label: 'Nitro flame' },
  { id: 'orbs', label: 'Twinkle orbs', requiresAchievement: 'Marathoner' },
  { id: 'smoke', label: 'Smoke puff', requiresAchievement: 'Road warrior' },
  {
    id: 'spark',
    label: 'Lightning spark',
    requiresAchievement: 'Daily driver',
  },
  { id: 'bubbles', label: 'Bubbles', requiresAchievement: 'Odometer' },
  { id: 'stars', label: 'Stardust', requiresAchievement: 'Steady hands' },
  { id: 'rainbow', label: 'Rainbow', requiresAchievement: 'Hat trick' },
]
