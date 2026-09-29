// Solo-race powerups (see TypingRace.tsx) — unlockable through achievements, same pattern as
// every other cosmetic/gameplay catalog. Only apply to solo races against bots: multiplayer is
// backed by a real WebSocket server (see backend/ws) that doesn't know about these yet, so
// they're deliberately not wired into MultiplayerRace.tsx.
export type PowerupKind = 'boost' | 'shell'

export interface PowerupDef {
  id: PowerupKind
  label: string
  detail: string
  requiresAchievement?: string
}

export const POWERUPS: Array<PowerupDef> = [
  {
    id: 'boost',
    label: 'Boost',
    detail: 'Instantly skips the word you’re on.',
  },
  {
    id: 'shell',
    label: 'Shell',
    detail: 'Knocks whoever’s leading back a word.',
    requiresAchievement: 'Getting warmed up',
  },
]
