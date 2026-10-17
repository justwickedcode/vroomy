// Special abilities ("powerups"): bought and equipped in the Garage (see #/lib/shop), fired with
// Tab in races with abilities on — solo (useSoloPowerups, where the bots use them too) and
// multiplayer ability lobbies (backend/ws announces it). Your equipped one is ready at GO and
// recharges ABILITY_RECHARGE_MS after each use (backend/ws's abilityRecharge must match).
//
// Like NitroType's nitros, every ability only ever helps whoever fires it — nobody can hit, slow
// or distract anyone else — and each helps in its own way: a word right now, two in one go,
// catching the car in front, or rewarding a hot streak.
export type PowerupKind = 'boost' | 'nitro' | 'slipstream' | 'overdrive'

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
    id: 'slipstream',
    label: 'Slipstream',
    detail: 'Rides the draft of the car ahead, up to four words forward.',
  },
  {
    id: 'overdrive',
    label: 'Overdrive',
    detail:
      'For six seconds, every word you finish carries you one further (up to three).',
  },
]

export const DEFAULT_POWERUP: PowerupKind = 'boost'

// A stored or received value as a known ability — anything else (one that's since been retired,
// say) falls back to the default.
export function asPowerup(value: unknown): PowerupKind {
  return POWERUPS.find((p) => p.id === value)?.id ?? DEFAULT_POWERUP
}

export function powerupDef(kind: PowerupKind): PowerupDef {
  return POWERUPS.find((p) => p.id === kind) ?? POWERUPS[0]
}

export function powerupLabel(kind: PowerupKind) {
  return powerupDef(kind).label
}

export const ABILITY_RECHARGE_MS = 12000
export const SLIPSTREAM_MAX_WORDS = 4
// Overdrive: how long it lasts, and the most extra words it can give.
export const OVERDRIVE_MS = 6000
export const OVERDRIVE_MAX_WORDS = 3
