// Solo-race powerups (see TypingRace.tsx) — bought in the Garage (see #/lib/shop). Only apply to solo races against bots: multiplayer is
// backed by a real WebSocket server (see backend/ws) that doesn't know about these yet, so
// they're deliberately not wired into MultiplayerRace.tsx.
export type PowerupKind =
  | 'boost'
  | 'nitro'
  | 'shell'
  | 'emp'
  | 'magnet'
  | 'nuke'

export interface PowerupDef {
  id: PowerupKind
  label: string
  detail: string
}

export const POWERUPS: Array<PowerupDef> = [
  {
    id: 'boost',
    label: 'Boost',
    detail: 'Instantly skips the word you’re on.',
  },
  {
    id: 'nitro',
    label: 'Nitro',
    detail: 'Slams through the next two words at once.',
  },
  {
    id: 'shell',
    label: 'Shell',
    detail: 'Knocks whoever’s leading back a word.',
  },
  {
    id: 'emp',
    label: 'EMP',
    detail: 'Stalls every bot on the track at once.',
  },
  {
    id: 'magnet',
    label: 'Magnet',
    detail: 'Yanks back whoever’s racing right in front of you.',
  },
  {
    id: 'nuke',
    label: 'Nuke',
    detail: 'Blasts every other racer three words back.',
  },
]
