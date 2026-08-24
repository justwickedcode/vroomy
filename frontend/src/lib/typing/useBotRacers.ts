import { useEffect, useMemo, useState } from 'react'

// Placeholder opponent until real multiplayer (backend-driven) races exist.
const BOT_NAMES = [
  'Ghost',
  'Nova',
  'Rex',
  'Blaze',
  'Vex',
  'Turbo',
  'Echo',
  'Storm',
]
const BOT_COLORS = ['#f59e0b', '#22c55e', '#ec4899', '#a855f7']
const TICK_MS = 120

export interface SpeedRange {
  id: string
  label: string
  wpm: [number, number]
}

export const SPEED_RANGES: Array<SpeedRange> = [
  { id: 'chill', label: 'Chill', wpm: [20, 35] },
  { id: 'average', label: 'Average', wpm: [40, 60] },
  { id: 'fast', label: 'Fast', wpm: [65, 85] },
  { id: 'pro', label: 'Pro', wpm: [90, 115] },
]

interface BotConfig {
  id: string
  name: string
  color: string
  baseWpm: number
  seed: number
}

export interface BotRacer {
  id: string
  name: string
  color: string
  progress: number
  wpm: number
  finished: boolean
}

function generateBots(
  count: number,
  wpmRange: [number, number],
): Array<BotConfig> {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5)
  const [min, max] = wpmRange
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${i}`,
    name: names[i],
    color: BOT_COLORS[i % BOT_COLORS.length],
    baseWpm: Math.round(min + Math.random() * (max - min)),
    seed: Math.random() * 1000,
  }))
}

export function useBotRacers({
  raceKey,
  started,
  startedAt,
  textLength,
  playerFinished,
  wpmRange,
  count = 1,
}: {
  raceKey: string
  started: boolean
  startedAt: number | null
  textLength: number
  playerFinished: boolean
  wpmRange: [number, number]
  count?: number
}): Array<BotRacer> {
  const configs = useMemo(
    () => generateBots(count, wpmRange),
    [raceKey, count, wpmRange[0], wpmRange[1]],
  )
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(null)
  }, [raceKey])

  useEffect(() => {
    if (!started || playerFinished) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [started, playerFinished])

  return configs.map((bot) => {
    if (!startedAt || !now) {
      return {
        id: bot.id,
        name: bot.name,
        color: bot.color,
        progress: 0,
        wpm: 0,
        finished: false,
      }
    }
    const elapsedMs = now - startedAt
    const elapsedMin = elapsedMs / 60000
    const wobble = 1 + 0.12 * Math.sin(elapsedMs / 1300 + bot.seed)
    const effectiveWpm = Math.max(0, bot.baseWpm * wobble)
    const charsTyped = effectiveWpm * 5 * elapsedMin
    const progress = textLength > 0 ? Math.min(charsTyped / textLength, 1) : 0
    return {
      id: bot.id,
      name: bot.name,
      color: bot.color,
      progress,
      wpm: Math.round(effectiveWpm),
      finished: progress >= 1,
    }
  })
}
