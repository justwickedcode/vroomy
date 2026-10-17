import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GHOST_MS,
  HIT_EFFECTS,
  POWERUPS,
  SELF_SKIP_WORDS,
  SLIPSTREAM_MAX_WORDS,
  TARGETING,
  pickTargets,
  powerupLabel,
} from '#/lib/powerups'
import type { PowerupKind, ScreenEffect } from '#/lib/powerups'
import type { BotRacer } from '#/lib/typing/useBotRacers'
import type { RaceEffect } from '#/components/typing/RaceTrack'

// Abilities in a solo race (see TypingRace.tsx).
//
// Classic: your equipped ability, once per race; the bots never fire anything.
// Chaos: an item roulette — every few seconds your empty slot spins up a random ability, and
// every bot runs the same roulette on its own clock and fires what it gets, mostly at you. Ghost
// makes anyone (you or a bot) immune for a while; whatever hits you shows up on your screen.

const TICK_MS = 100
// Chaos timings.
const FIRST_ROLL_MS = 2500
const ROLL_SPIN_MS = 1100
const RECHARGE_MS = 8000
const BOT_FIRST_FIRE_MS: [number, number] = [5000, 12000]
const BOT_REFIRE_MS: [number, number] = [8000, 15000]
const EFFECT_MS = 900
const EVENT_MS = 2000
// An average word is ~6 characters with its space, for turning a progress gap into words.
const CHARS_PER_WORD = 6

const KINDS = POWERUPS.map((p) => p.id)

function randomKind(): PowerupKind {
  return KINDS[Math.floor(Math.random() * KINDS.length)]
}

function randomIn([min, max]: [number, number]) {
  return min + Math.random() * (max - min)
}

// A visual effect on your typing screen, from something that hit you. `key` changes per hit so
// the same effect twice in a row replays.
export interface ScreenHit {
  screen: ScreenEffect
  key: number
}

export function useSoloPowerups({
  chaos,
  equipped,
  raceKey,
  startedAt,
  finished,
  locked,
  progress,
  textLength,
  bots,
  hitBot,
  delayBot,
  skipWord,
}: {
  chaos: boolean
  equipped: PowerupKind
  raceKey: string
  startedAt: number | null
  finished: boolean
  locked: boolean
  progress: number
  textLength: number
  bots: Array<BotRacer>
  hitBot: (id: string, words?: number) => void
  delayBot: (id: string, ms: number) => void
  skipWord: (count?: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const racing = startedAt !== null && !finished

  // Your slot. Classic: the equipped ability until used. Chaos: filled by the roulette.
  const [used, setUsed] = useState(false)
  const [rolled, setRolled] = useState<PowerupKind | null>(null)
  const nextRollAtRef = useRef<number | null>(null)

  const [effect, setEffect] = useState<RaceEffect | null>(null)
  const [event, setEvent] = useState<string | null>(null)
  const [screen, setScreen] = useState<ScreenHit | null>(null)
  const screenUntilRef = useRef(0)
  const frozenUntilRef = useRef(0)
  const ghostYouUntilRef = useRef(0)
  const ghostBotsRef = useRef<Record<string, number>>({})
  const botNextAtRef = useRef<Record<string, number>>({})
  const keyRef = useRef(0)
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A new passage is a new race: everything resets.
  useEffect(() => {
    setUsed(false)
    setRolled(null)
    setEffect(null)
    setEvent(null)
    setScreen(null)
    nextRollAtRef.current = null
    screenUntilRef.current = 0
    frozenUntilRef.current = 0
    ghostYouUntilRef.current = 0
    ghostBotsRef.current = {}
    botNextAtRef.current = {}
  }, [raceKey])

  useEffect(() => {
    return () => {
      if (effectTimer.current) clearTimeout(effectTimer.current)
      if (eventTimer.current) clearTimeout(eventTimer.current)
    }
  }, [])

  // The race clock for everything time-based here: roulette, recharge, freezes, ghosts, bots.
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

  const showEffect = useCallback(
    (kind: PowerupKind, sourceId: string, targetIds: Array<string>) => {
      keyRef.current += 1
      setEffect({
        kind,
        sourceId,
        targetIds,
        targetId: targetIds[0],
        key: keyRef.current,
      })
      if (effectTimer.current) clearTimeout(effectTimer.current)
      effectTimer.current = setTimeout(() => setEffect(null), EFFECT_MS)
    },
    [],
  )

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

  // ── You fire ──────────────────────────────────────────────────────
  const fireAs = useCallback(
    (kind: PowerupKind) => {
      const t = Date.now()
      const label = powerupLabel(kind)
      if (TARGETING[kind] === 'self') {
        if (kind === 'ghost') ghostYouUntilRef.current = t + GHOST_MS
        else if (kind === 'slipstream') {
          skipWord(
            slipstreamWords(
              progress,
              bots.filter((b) => !b.finished).map((b) => b.progress),
            ),
          )
        } else skipWord(SELF_SKIP_WORDS[kind] ?? 1)
        showEffect(kind, 'you', ['you'])
        announce(`${label}!`)
        return
      }
      const rivals = bots
        .filter((b) => !b.finished)
        .map((b) => ({ id: b.id, progress: b.progress }))
      const targets = pickTargets(kind, progress, rivals)
      const hits = targets.filter((id) => (ghostBotsRef.current[id] ?? 0) <= t)
      const dodged = targets.length - hits.length
      const hit = HIT_EFFECTS[kind]
      for (const id of hits) {
        if (hit?.botWords) hitBot(id, hit.botWords)
        // Half speed for botSlowMs costs half of it.
        if (hit?.botSlowMs) delayBot(id, hit.botSlowMs / 2)
      }
      showEffect(kind, 'you', hits)
      const nameOf = (id: string) => bots.find((b) => b.id === id)?.name ?? ''
      if (hits.length === 0) {
        announce(dodged > 0 ? `${label} — ghosted through!` : `${label}!`)
      } else if (TARGETING[kind] === 'all') {
        announce(`${label}!`)
      } else {
        announce(`${label}: ${nameOf(hits[0])}!`)
      }
    },
    [
      bots,
      progress,
      hitBot,
      delayBot,
      skipWord,
      slipstreamWords,
      showEffect,
      announce,
    ],
  )

  const slot: PowerupKind | null = finished
    ? null
    : chaos
      ? rolled
      : used
        ? null
        : equipped

  const fire = useCallback(() => {
    if (!slot || locked || finished) return
    fireAs(slot)
    if (chaos) {
      setRolled(null)
      nextRollAtRef.current = Date.now() + RECHARGE_MS
    } else {
      setUsed(true)
    }
  }, [slot, locked, finished, fireAs, chaos])

  // ── Something hits you ────────────────────────────────────────────
  const hitYou = useCallback(
    (kind: PowerupKind, byName: string, byId: string) => {
      const t = Date.now()
      const label = powerupLabel(kind)
      if (ghostYouUntilRef.current > t) {
        showEffect('ghost', byId, ['you'])
        announce(`Ghosted through ${byName}'s ${label}!`)
        return
      }
      const hit = HIT_EFFECTS[kind]
      if (!hit) return
      if (hit.freezeMs > 0) {
        frozenUntilRef.current = Math.max(
          frozenUntilRef.current,
          t + hit.freezeMs,
        )
      }
      if (hit.screen) {
        keyRef.current += 1
        setScreen({ screen: hit.screen, key: keyRef.current })
        screenUntilRef.current = t + (hit.screenMs ?? 1000)
      }
      showEffect(kind, byId, ['you'])
      announce(`${byName} hit you with ${label}!`)
    },
    [showEffect, announce],
  )

  // ── Chaos: the roulette and the bots ──────────────────────────────
  useEffect(() => {
    if (!racing) return
    const t = now

    // Your screen effect wears off.
    if (screen && t >= screenUntilRef.current) setScreen(null)

    if (!chaos) return

    // Your roulette.
    if (nextRollAtRef.current === null) {
      nextRollAtRef.current = startedAt + FIRST_ROLL_MS
    }
    if (!rolled && t >= nextRollAtRef.current + ROLL_SPIN_MS) {
      setRolled(randomKind())
    }

    // The bots: each on its own clock.
    for (const bot of bots) {
      if (bot.finished) continue
      const due = (botNextAtRef.current[bot.id] ??=
        startedAt + randomIn(BOT_FIRST_FIRE_MS))
      if (t < due) continue
      botNextAtRef.current[bot.id] = t + randomIn(BOT_REFIRE_MS)

      const kind = randomKind()
      const label = powerupLabel(kind)
      if (TARGETING[kind] === 'self') {
        if (kind === 'ghost') ghostBotsRef.current[bot.id] = t + GHOST_MS
        else {
          const words =
            kind === 'slipstream'
              ? slipstreamWords(bot.progress, [
                  progress,
                  ...bots
                    .filter((b) => b.id !== bot.id && !b.finished)
                    .map((b) => b.progress),
                ])
              : (SELF_SKIP_WORDS[kind] ?? 1)
          hitBot(bot.id, -words)
        }
        showEffect(kind, bot.id, [bot.id])
        announce(`${bot.name}: ${label}!`)
      } else {
        // Bots gang up on you — that's the point of chaos.
        hitYou(kind, bot.name, bot.id)
      }
    }
    // `now` drives this; everything else is read fresh each tick.
  }, [now])

  const rolling =
    chaos &&
    racing &&
    !rolled &&
    nextRollAtRef.current !== null &&
    now >= nextRollAtRef.current
  // While rolling, the item box flicks through random faces.
  const face: PowerupKind | null = rolling
    ? KINDS[Math.floor(now / TICK_MS) % KINDS.length]
    : slot
  const charge =
    !chaos || rolled || rolling || nextRollAtRef.current === null
      ? 1
      : Math.min(
          1,
          Math.max(
            0,
            1 -
              (nextRollAtRef.current - now) /
                (startedAt !== null &&
                nextRollAtRef.current === startedAt + FIRST_ROLL_MS
                  ? FIRST_ROLL_MS
                  : RECHARGE_MS),
          ),
        )

  const ghostBots = new Set(
    Object.entries(ghostBotsRef.current)
      .filter(([, until]) => until > now)
      .map(([id]) => id),
  )

  return {
    slot,
    face,
    rolling,
    charge,
    fire,
    effect,
    event,
    screen,
    frozen: frozenUntilRef.current > now,
    ghostYou: ghostYouUntilRef.current > now,
    ghostBots,
  }
}
