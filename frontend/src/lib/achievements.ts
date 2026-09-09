import { Award, Flame, Medal, Rocket, Target, Zap } from 'lucide-react'
import type { ProfileStats, RaceRecord } from '#/lib/profile/useProfile'
import type { LucideIcon } from 'lucide-react'

export interface Achievement {
  icon: LucideIcon
  title: string
  detail: string
  unlocked: (stats: ProfileStats, races: Array<RaceRecord>) => boolean
}

// Single source of truth — the achievements page and the dashboard teaser
// both evaluate this same list against live profile data rather than each
// keeping their own copy of the badge definitions.
export const ACHIEVEMENTS: Array<Achievement> = [
  {
    icon: Rocket,
    title: 'First lap',
    detail: 'Finish your first race.',
    unlocked: (stats) => stats.racesPlayed >= 1,
  },
  {
    icon: Zap,
    title: 'Speed demon',
    detail: 'Hit 60 wpm in a race.',
    unlocked: (stats) => stats.bestWpm >= 60,
  },
  {
    icon: Flame,
    title: 'Century club',
    detail: 'Hit 100 wpm in a race.',
    unlocked: (stats) => stats.bestWpm >= 100,
  },
  {
    icon: Target,
    title: 'Sharpshooter',
    detail: 'Finish a race with 100% accuracy.',
    unlocked: (_stats, races) => races.some((r) => r.accuracy === 100),
  },
  {
    icon: Medal,
    title: 'On the podium',
    detail: 'Finish 1st, 2nd, or 3rd.',
    unlocked: (_stats, races) => races.some((r) => r.placement <= 3),
  },
  {
    icon: Award,
    title: 'Marathoner',
    detail: 'Run 10 races.',
    unlocked: (stats) => stats.racesPlayed >= 10,
  },
]
