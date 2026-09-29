// The visual effect trailing off the back of the player's own car during a race (see
// RaceTrack.tsx's Trail component) — a cosmetic pick, same pattern as vehicles/underglow:
// unlockable through achievements rather than purchased.
export type TrailVariant = 'nitro' | 'orbs' | 'smoke' | 'spark'

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
]
