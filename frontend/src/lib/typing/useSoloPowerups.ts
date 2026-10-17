import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ABILITY_RECHARGE_MS,
  OVERDRIVE_MAX_WORDS,
  OVERDRIVE_MS,
  POWERUPS,
  SLIPSTREAM_MAX_WORDS,
  powerupLabel,
} from '#/lib/powerups'
import type { PowerupKind } from '#/lib/powerups'
import type { BotRacer } from '#/lib/typing/useBotRacers'
import type { RaceEffect } from '#/components/typing/RaceTrack'

// Abilities in a solo race with abilities on (see TypingRace.tsx). Every one only helps whoever
// fires it. Your equipped ability is ready at GO and recharges ABILITY_RECHARGE_MS after each use;
// every bot uses random abilities on its own clock.

const TICK_MS = 100
const BOT_FIRST_FIRE_MS: [number, number] = [6000, 12000]
const BOT_REFIRE_MS: [number, number] = [10000, 18000]
const EFFECT_MS = 900
const EVENT_MS = 2000
// An average word is ~6 characters with its space, for turning a progress gap into words.
const CHARS_PER_WORD = 6
// What a bot's ability is worth to it, in words.
const BOT_WORDS: Record<PowerupKind, number> = {
  boost: 1,
  nitro: 2,
  slipstream: 0, // worked out from the gap ahead
  overdrive: OVERDRIVE_MAX_WORDS,
}

const KINDS = POWERUPS.map((p) => p.id)

function randomKind(): PowerupKind {
  return KINDS[Math.floor(Math.random() * KINDS.length)]
}

function randomIn([min, max]: [number, number]) {
  return min + Math.random() * (max - min)
}

export function useSoloPowerups({
  enabled,
  equipped,
  raceKey,
  startedAt,
  finished,
  locked,
  progress,
  activeWordIndex,
  textLength,
  bots,
  hitBot,
  skipWord,
}: {
  // Abilities on for this race (else this hook does nothing).
  enabled: boolean
  equipped: PowerupKind
  raceKey: string
  startedAt: number | null
  finished: boolean
  locked: boolean
  progress: number
  activeWordIndex: number
  textLength: number
  bots: Array<BotRacer>
  hitBot: (id: string, words?: number) => void
  skipWord: (count?: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const racing = startedAt !== null && !finished

  // When your ability was last used (null: not yet this race — it's ready).
  const [usedAt, setUsedAt] = useState<number | null>(null)

  const [effect, setEffect] = useState<RaceEffect | null>(null)
  const [event, setEvent] = useState<string | null>(null)
  // Overdrive: until when, how many bonus words are left, and the word our own last bonus skip
  // landed on (so that skip doesn't count as "a word you finished" and chain on itself).
  const overdriveRef = useRef({ until: 0, left: 0, landedOn: -1 })
  const lastWordRef = useRef(activeWordIndex)
  const botNextAtRef = useRef<Record<string, number>>({})
  const keyRef = useRef(0)
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A new passage is a new race: everything resets.
  useEffect(() => {
    setUsedAt(null)
    setEffect(null)
    setEvent(null)
    overdriveRef.current = { until: 0, left: 0, landedOn: -1 }
    botNextAtRef.current = {}
  }, [raceKey])

  useEffect(() => {
    return () => {
      if (effectTimer.current) clearTimeout(effectTimer.current)
      if (eventTimer.current) clearTimeout(eventTimer.current)
    }
  }, [])

  // The race clock for everything time-based here: roulette, recharge, timers, bots.
  useEffect(() => {
    if (!racing) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [racing])

  const announce = useCallback((text: string) => {
    setEvent(text)
    if (eventTimer.current) clearTimeout(eventTimer.current)
    eventTimer.current = setTimeout(() => setEvent(null), EVENT_MS)
  }, [])

  const showEffect = useCallback((kind: PowerupKind, sourceId: string) => {
    keyRef.current += 1
    setEffect({ kind, sourceId, key: keyRef.current })
    if (effectTimer.current) clearTimeout(effectTimer.current)
    effectTimer.current = setTimeout(() => setEffect(null), EFFECT_MS)
  }, [])

  // Words to the car directly ahead of someone at `from`, for Slipstream.
  const slipstreamWords = useCallback(
    (from: number, others: Array<number>) => {
      const ahead = others.filter((p) => p > from)
      if (ahead.length === 0) return 1
      const gapChars = (Math.min(...ahead) - from) * textLength
      return Math.min(
        SLIPSTREAM_MAX_WORDS,
        Math.max(1, Math.ceil(gapChars / CHARS_PER_WORD)),
      )
    },
    [textLength],
  )

  // Overdrive in action: each word you finish yourself carries you one word further.
  useEffect(() => {
    const prev = lastWordRef.current
    lastWordRef.current = activeWordIndex
    const od = overdriveRef.current
    if (activeWordIndex <= prev || activeWordIndex === od.landedOn) return
    if (od.left <= 0 || Date.now() > od.until) return
    od.left -= 1
    od.landedOn = activeWordIndex + 1
    skipWord(1)
  }, [activeWordIndex, skipWord])

  // ── You fire ──────────────────────────────────────────────────────
  const fireAs = useCallback(
    (kind: PowerupKind) => {
      const t = Date.now()
      if (kind === 'boost') skipWord(1)
      else if (kind === 'nitro') skipWord(2)
      else if (kind === 'slipstream') {
        skipWord(
          slipstreamWords(
            progress,
            bots.filter((b) => !b.finished).map((b) => b.progress),
          ),
        )
      } else {
        overdriveRef.current = {
          until: t + OVERDRIVE_MS,
          left: OVERDRIVE_MAX_WORDS,
          landedOn: -1,
        }
      }
      showEffect(kind, 'you')
      announce(`${powerupLabel(kind)}!`)
    },
    [bots, progress, skipWord, slipstreamWords, showEffect, announce],
  )

  const ready =
    enabled &&
    !finished &&
    (usedAt === null || now - usedAt >= ABILITY_RECHARGE_MS)
  const slot: PowerupKind | null = ready ? equipped : null

  const fire = useCallback(() => {
    if (!slot || locked || finished) return
    fireAs(slot)
    setUsedAt(Date.now())
    setNow(Date.now())
  }, [slot, locked, finished, fireAs])

  // ── The bots ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!racing || !enabled) return
    const t = now

    // The bots: each on its own clock, using what it rolls on itself.
    for (const bot of bots) {
      if (bot.finished) continue
      const due = (botNextAtRef.current[bot.id] ??=
        startedAt + randomIn(BOT_FIRST_FIRE_MS))
      if (t < due) continue
      botNextAtRef.current[bot.id] = t + randomIn(BOT_REFIRE_MS)
      const kind = randomKind()
      const words =
        kind === 'slipstream'
          ? slipstreamWords(bot.progress, [
              progress,
              ...bots
                .filter((b) => b.id !== bot.id && !b.finished)
                .map((b) => b.progress),
            ])
          : BOT_WORDS[kind]
      hitBot(bot.id, -words)
      showEffect(kind, bot.id)
      announce(`${bot.name}: ${powerupLabel(kind)}!`)
    }
    // `now` drives this; everything else is read fresh each tick.
  }, [now])

  // How far your ability has recharged, 0..1.
  const charge =
    usedAt === null ? 1 : Math.min(1, (now - usedAt) / ABILITY_RECHARGE_MS)

  // What's running on you right now, for the car and the console.
  const overdrive =
    overdriveRef.current.until > now && overdriveRef.current.left > 0

  return {
    slot,
    charge,
    fire,
    effect,
    event,
    overdrive,
  }
}
