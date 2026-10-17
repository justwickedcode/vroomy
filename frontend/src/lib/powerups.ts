// Special abilities ("powerups"): bought in the Garage (see #/lib/shop) and fired with Tab.
//
// - Solo (TypingRace.tsx): your equipped one, once per race; bots don't fire anything.
// - Chaos solo (see useSoloPowerups): everyone — you and the bots — gets a random one from an
//   item roulette every few seconds, and the bots fire theirs at you.
// - Multiplayer powerup lobbies: your equipped one, once per race; backend/ws picks the targets
//   and announces the hit (its powerupFreezeMs table must match HIT_EFFECTS below).
export type PowerupKind =
  | 'boost'
  | 'nitro'
  | 'slipstream'
  | 'ghost'
  | 'shell'
  | 'magnet'
  | 'oil'
  | 'mirror'
  | 'emp'
  | 'ink'
  | 'quake'
  | 'disco'
  | 'timewarp'
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
    id: 'slipstream',
    label: 'Slipstream',
    detail: 'Rides the draft of the car ahead, up to four words forward.',
  },
  {
    id: 'ghost',
    label: 'Ghost',
    detail: 'Turns you see-through for 10 seconds: attacks pass right through.',
  },
  {
    id: 'shell',
    label: 'Shell',
    detail: 'Knocks whoever’s leading back a word.',
  },
  {
    id: 'magnet',
    label: 'Magnet',
    detail: 'Yanks back whoever’s racing right in front of you.',
  },
  {
    id: 'oil',
    label: 'Oil Slick',
    detail: 'Spills oil behind you; whoever’s on your tail spins out.',
  },
  {
    id: 'mirror',
    label: 'Mirror',
    detail: 'Flips the leader’s text back to front.',
  },
  { id: 'emp', label: 'EMP', detail: 'Stalls everyone on the track at once.' },
  {
    id: 'ink',
    label: 'Ink Bomb',
    detail: 'Splatters ink across everyone else’s screen.',
  },
  {
    id: 'quake',
    label: 'Quake',
    detail: 'Shakes the road under everyone else.',
  },
  {
    id: 'disco',
    label: 'Disco',
    detail: 'Blinds everyone else with a strobing disco floor.',
  },
  {
    id: 'timewarp',
    label: 'Time Warp',
    detail: 'Drops everyone else into slow motion for five seconds.',
  },
  {
    id: 'nuke',
    label: 'Nuke',
    detail: 'Blasts every other racer three words back.',
  },
]

export function powerupDef(kind: PowerupKind): PowerupDef {
  return POWERUPS.find((p) => p.id === kind) ?? POWERUPS[0]
}

// What an ability does to a racer it hits. `freezeMs` locks their keyboard (in multiplayer this
// is the only cost — knocking a real person back would delete what they typed); `screen` is a
// visual effect over their typing screen for `screenMs`. A bot hit in solo loses `botWords`
// words' worth of time instead (Time Warp slows them for `botSlowMs` at half speed).
export type ScreenEffect =
  | 'shake'
  | 'static'
  | 'flash'
  | 'spin'
  | 'mirror'
  | 'ink'
  | 'quake'
  | 'disco'
  | 'warp'

export interface HitEffect {
  freezeMs: number
  screen?: ScreenEffect
  screenMs?: number
  botWords: number
  botSlowMs?: number
}

export const HIT_EFFECTS: Partial<Record<PowerupKind, HitEffect>> = {
  shell: { freezeMs: 1500, screen: 'shake', screenMs: 600, botWords: 1 },
  magnet: { freezeMs: 1500, screen: 'shake', screenMs: 600, botWords: 1 },
  oil: { freezeMs: 1200, screen: 'spin', screenMs: 1200, botWords: 2 },
  mirror: { freezeMs: 0, screen: 'mirror', screenMs: 4000, botWords: 2 },
  emp: { freezeMs: 1000, screen: 'static', screenMs: 1000, botWords: 1 },
  ink: { freezeMs: 0, screen: 'ink', screenMs: 4000, botWords: 1 },
  quake: { freezeMs: 0, screen: 'quake', screenMs: 2500, botWords: 1 },
  disco: { freezeMs: 0, screen: 'disco', screenMs: 4000, botWords: 1 },
  timewarp: {
    freezeMs: 1500,
    screen: 'warp',
    screenMs: 2500,
    botWords: 0,
    botSlowMs: 5000,
  },
  nuke: { freezeMs: 3000, screen: 'flash', screenMs: 1200, botWords: 3 },
}

// Abilities that only affect whoever fires them.
export const SELF_SKIP_WORDS: Partial<Record<PowerupKind, number>> = {
  boost: 1,
  nitro: 2,
}
export const SLIPSTREAM_MAX_WORDS = 4
export const GHOST_MS = 10000

// Who an offensive ability hits, among rivals still racing (by progress, furthest first):
//   leader — shell, mirror · next ahead — magnet · right behind — oil · everyone — the rest.
export type Targeting = 'leader' | 'ahead' | 'behind' | 'all' | 'self'

export const TARGETING: Record<PowerupKind, Targeting> = {
  boost: 'self',
  nitro: 'self',
  slipstream: 'self',
  ghost: 'self',
  shell: 'leader',
  mirror: 'leader',
  magnet: 'ahead',
  oil: 'behind',
  emp: 'all',
  ink: 'all',
  quake: 'all',
  disco: 'all',
  timewarp: 'all',
  nuke: 'all',
}

// Picks the ids an ability fired by someone at `userProgress` hits, from `rivals` (still racing,
// not shielded). Falls back sensibly: magnet with nobody ahead takes the leader; oil with nobody
// behind hits whoever's closest ahead.
export function pickTargets(
  kind: PowerupKind,
  userProgress: number,
  rivals: Array<{ id: string; progress: number }>,
): Array<string> {
  if (rivals.length === 0) return []
  const byLead = [...rivals].sort((a, b) => b.progress - a.progress)
  const ahead = byLead.filter((r) => r.progress > userProgress)
  const behind = byLead.filter((r) => r.progress <= userProgress)
  switch (TARGETING[kind]) {
    case 'leader':
      return [byLead[0].id]
    case 'ahead':
      return [(ahead.at(-1) ?? byLead[0]).id]
    case 'behind':
      return [(behind.at(0) ?? ahead.at(-1) ?? byLead[0]).id]
    case 'all':
      return byLead.map((r) => r.id)
    default:
      return []
  }
}

// What the announcer says: "Ink Bomb!" for your own, "Nova: Disco!" for a rival's.
export function powerupLabel(kind: PowerupKind) {
  return powerupDef(kind).label
}
