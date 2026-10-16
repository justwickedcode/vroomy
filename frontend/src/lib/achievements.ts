import {
  Award,
  CalendarClock,
  CheckCheck,
  Crosshair,
  Crown,
  Flag,
  Flame,
  Gauge,
  MapPin,
  Medal,
  Milestone,
  Moon,
  Rabbit,
  Rocket,
  Route,
  Sparkles,
  Sunrise,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Wind,
  Zap,
} from '#/components/ui/icons'
import REWARDS from '#/lib/shop/achievement_rewards.json'
import type { ProfileStats, RaceRecord } from '#/lib/profile/useProfile'
import type { IconComponent } from '#/components/ui/icons'

export type AchievementCategory =
  | 'Speed'
  | 'Endurance'
  | 'Precision'
  | 'Podium'
  | 'Timing'

export interface Achievement {
  // Stable id — what the server records and pays for (backend/api/achievements.go mirrors these
  // rules by id).
  id: string
  icon: IconComponent
  title: string
  detail: string
  category: AchievementCategory
  unlocked: (stats: ProfileStats, races: Array<RaceRecord>) => boolean
}

// The 3 most recent races, newest first (races is already stored newest-first — see
// useProfile's addRace) — shared by the streak achievements below so "consecutive" always
// means the same thing in both places.
function lastThree(races: Array<RaceRecord>) {
  return races.length >= 3 ? races.slice(0, 3) : null
}

// Coins each achievement pays, once — an identical copy lives in backend/api (a Go test keeps
// them in sync). Logged-in players are paid by the server; guests by useProfile.
export function achievementReward(id: string): number {
  return (REWARDS as Record<string, number | undefined>)[id] ?? 0
}

// Single source of truth — the achievements page and the dashboard teaser both evaluate this
// same list against live profile data rather than each keeping their own copy of the badge
// definitions.
export const ACHIEVEMENTS: Array<Achievement> = [
  // ── Speed — wpm milestones, easiest to hardest ─────────────────────────
  {
    icon: Rocket,
    id: 'first-lap',
    title: 'First lap',
    detail: 'Finish your first race.',
    category: 'Speed',
    unlocked: (stats) => stats.racesPlayed >= 1,
  },
  {
    icon: Wind,
    id: 'getting-warmed-up',
    title: 'Getting warmed up',
    detail: 'Hit 30 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 30,
  },
  {
    icon: Zap,
    id: 'speed-demon',
    title: 'Speed demon',
    detail: 'Hit 60 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 60,
  },
  {
    icon: Gauge,
    id: 'highway-cruiser',
    title: 'Highway cruiser',
    detail: 'Hit 80 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 80,
  },
  {
    icon: Flame,
    id: 'century-club',
    title: 'Century club',
    detail: 'Hit 100 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 100,
  },
  {
    icon: Rabbit,
    id: 'turbocharged',
    title: 'Turbocharged',
    detail: 'Hit 120 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 120,
  },
  {
    icon: Sparkles,
    id: 'nitro-boost',
    title: 'Nitro boost',
    detail: 'Hit 150 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 150,
  },
  {
    icon: TrendingUp,
    id: 'ludicrous-speed',
    title: 'Ludicrous speed',
    detail: 'Hit 200 wpm in a race.',
    category: 'Speed',
    unlocked: (stats) => stats.bestWpm >= 200,
  },

  // ── Endurance — lifetime race count ─────────────────────────────────
  {
    icon: Award,
    id: 'marathoner',
    title: 'Marathoner',
    detail: 'Run 10 races.',
    category: 'Endurance',
    unlocked: (stats) => stats.racesPlayed >= 10,
  },
  {
    icon: Route,
    id: 'road-warrior',
    title: 'Road warrior',
    detail: 'Run 25 races.',
    category: 'Endurance',
    unlocked: (stats) => stats.racesPlayed >= 25,
  },
  {
    icon: CalendarClock,
    id: 'daily-driver',
    title: 'Daily driver',
    detail: 'Run 50 races.',
    category: 'Endurance',
    unlocked: (stats) => stats.racesPlayed >= 50,
  },
  {
    icon: MapPin,
    id: 'long-hauler',
    title: 'Long hauler',
    detail: 'Run 100 races.',
    category: 'Endurance',
    unlocked: (stats) => stats.racesPlayed >= 100,
  },
  {
    icon: Milestone,
    id: 'odometer',
    title: 'Odometer',
    detail: 'Run 250 races.',
    category: 'Endurance',
    unlocked: (stats) => stats.racesPlayed >= 250,
  },

  // ── Precision — accuracy ─────────────────────────────────────────────
  {
    icon: Target,
    id: 'sharpshooter',
    title: 'Sharpshooter',
    detail: 'Finish a race with 100% accuracy.',
    category: 'Precision',
    unlocked: (_stats, races) => races.some((r) => r.accuracy === 100),
  },
  {
    icon: Crosshair,
    id: 'steady-hands',
    title: 'Steady hands',
    detail: 'Keep 95%+ average accuracy over at least 5 races.',
    category: 'Precision',
    unlocked: (stats) => stats.racesPlayed >= 5 && stats.avgAccuracy >= 95,
  },
  {
    icon: CheckCheck,
    id: 'flawless-streak',
    title: 'Flawless streak',
    detail: 'Finish 3 races in a row with 100% accuracy.',
    category: 'Precision',
    unlocked: (_stats, races) => {
      const last3 = lastThree(races)
      return last3 !== null && last3.every((r) => r.accuracy === 100)
    },
  },

  // ── Podium — placement ────────────────────────────────────────────────
  {
    icon: Medal,
    id: 'on-the-podium',
    title: 'On the podium',
    detail: 'Finish 1st, 2nd, or 3rd.',
    category: 'Podium',
    unlocked: (_stats, races) => races.some((r) => r.placement <= 3),
  },
  {
    icon: Flag,
    id: 'checkered-flag',
    title: 'Checkered flag',
    detail: 'Win a race outright.',
    category: 'Podium',
    unlocked: (stats) => stats.wins >= 1,
  },
  {
    icon: Crown,
    id: 'hat-trick',
    title: 'Hat trick',
    detail: 'Win 3 races.',
    category: 'Podium',
    unlocked: (stats) => stats.wins >= 3,
  },
  {
    icon: Swords,
    id: 'giant-slayer',
    title: 'Giant slayer',
    detail: 'Win a race against at least 4 other racers.',
    category: 'Podium',
    unlocked: (_stats, races) =>
      races.some((r) => r.placement === 1 && r.racerCount >= 5),
  },
  {
    icon: Trophy,
    id: 'win-streak',
    title: 'Win streak',
    detail: 'Win 3 races in a row.',
    category: 'Podium',
    unlocked: (_stats, races) => {
      const last3 = lastThree(races)
      return last3 !== null && last3.every((r) => r.placement === 1)
    },
  },

  // ── Timing — when you raced, not how well ────────────────────────────
  {
    icon: Sunrise,
    id: 'early-bird',
    title: 'Early bird',
    detail: 'Finish a race before 7am.',
    category: 'Timing',
    unlocked: (_stats, races) =>
      races.some((r) => new Date(r.date).getHours() < 7),
  },
  {
    icon: Moon,
    id: 'night-owl',
    title: 'Night owl',
    detail: 'Finish a race between midnight and 4am.',
    category: 'Timing',
    unlocked: (_stats, races) =>
      races.some((r) => new Date(r.date).getHours() < 4),
  },
]
