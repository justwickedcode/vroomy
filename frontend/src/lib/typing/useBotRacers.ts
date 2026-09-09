import { useEffect, useMemo, useRef, useState } from 'react'
import { CAR_MODELS } from '#/components/typing/CarIcon'
import type { CarModel } from '#/components/typing/CarIcon'

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
const WOBBLE_AMPLITUDE = 0.12
const WOBBLE_PERIOD_MS = 1300

export interface SpeedRange {
  id: string
  label: string
  wpm: [number, number]
}

export const SPEED_RANGES: Array<SpeedRange> = [
  { id: 'chill', label: 'School Zone', wpm: [20, 35] },
  { id: 'average', label: 'Sunday Drive', wpm: [40, 60] },
  { id: 'fast', label: 'Highway', wpm: [65, 85] },
  { id: 'pro', label: 'Autobahn', wpm: [90, 115] },
  { id: 'elite', label: 'Formula 1', wpm: [120, 150] },
  { id: 'insane', label: 'Ludicrous Mode', wpm: [160, 200] },
  { id: 'godlike', label: 'Warp Speed', wpm: [210, 260] },
]

interface BotConfig {
  id: string
  name: string
  color: string
  model: CarModel
  baseWpm: number
  seed: number
}

export interface BotRacer {
  id: string
  name: string
  color: string
  model: CarModel
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
    model: CAR_MODELS[i % CAR_MODELS.length].id,
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
  // Once a bot crosses the line its displayed wpm freezes at whatever it
  // was at that instant — without this, the wobble formula keeps
  // recalculating forever and a "finished" car's number would keep
  // drifting even though it's sitting still at the finish line.
  const finishedRef = useRef<Record<string, number | undefined>>({})

  useEffect(() => {
    setNow(null)
    finishedRef.current = {}
  }, [raceKey])

  useEffect(() => {
    if (!started || playerFinished) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [started, playerFinished])

  return configs.map((bot) => {
    const frozenWpm = finishedRef.current[bot.id]
    if (frozenWpm !== undefined) {
      return {
        id: bot.id,
        name: bot.name,
        color: bot.color,
        model: bot.model,
        progress: 1,
        wpm: frozenWpm,
        finished: true,
      }
    }

    if (!startedAt || !now) {
      return {
        id: bot.id,
        name: bot.name,
        color: bot.color,
        model: bot.model,
        progress: 0,
        wpm: 0,
        finished: false,
      }
    }
    const elapsedMs = now - startedAt
    const wobble =
      1 + WOBBLE_AMPLITUDE * Math.sin(elapsedMs / WOBBLE_PERIOD_MS + bot.seed)
    const effectiveWpm = Math.max(0, bot.baseWpm * wobble)

    // Distance has to be the *integral* of wpm(t), not wpm(t) times total
    // elapsed time — that shortcut let a mid-wobble dip make a bot's
    // instantaneous rate low enough that "wpm-right-now * elapsed-so-far"
    // came out smaller than it was a tick ago, i.e. the car visibly
    // slid backward. wobble is always positive (amplitude < 1), so this
    // closed-form integral is guaranteed monotonically increasing.
    const integralMinutes =
      elapsedMs / 60000 -
      ((WOBBLE_AMPLITUDE * WOBBLE_PERIOD_MS) / 60000) *
        (Math.cos(elapsedMs / WOBBLE_PERIOD_MS + bot.seed) - Math.cos(bot.seed))
    const charsTyped = 5 * bot.baseWpm * integralMinutes
    const progress = textLength > 0 ? Math.min(charsTyped / textLength, 1) : 0
    const finished = progress >= 1
    const wpm = Math.round(effectiveWpm)
    if (finished) finishedRef.current[bot.id] = wpm

    return {
      id: bot.id,
      name: bot.name,
      color: bot.color,
      model: bot.model,
      progress,
      wpm,
      finished,
    }
  })
}
