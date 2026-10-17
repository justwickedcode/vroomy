import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeWordSpans } from '#/lib/typing/useTypingRace'
import { useReplayRecorder } from '#/lib/replay/recorder'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import {
  ABILITY_RECHARGE_MS,
  OVERDRIVE_MAX_WORDS,
  OVERDRIVE_MS,
  SLIPSTREAM_MAX_WORDS,
} from '#/lib/powerups'
import type { PowerupKind } from '#/lib/powerups'

// Talks to backend/ws (a separate Go service — see backend/ws/README.md) over a raw WebSocket,
// not fetch/TanStack Query: this is a stateful, long-lived, server-pushed session (matchmaking,
// countdown, live opponent progress), not a one-shot request/response.
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8081'

const TICK_MS = 100
// Below this, elapsed time is too noisy to extrapolate into a per-minute rate — matches
// useTypingRace's own threshold, since both feed the same Gauge display.
const MIN_ELAPSED_FOR_WPM_MS = 1500

// Classic rooms are pure typing; powerup rooms let each player fire their equipped powerup once
// per race. Players are only ever matched with others who picked the same (see backend/ws's
// lobbyMode).
export type LobbyMode = 'classic' | 'powerups'

// A powerup someone in the room fired, as the server announced it. `key` is unique per event so
// the race view can replay the effect even when the same kind fires twice in a row.
export interface PowerupEvent {
  key: number
  playerId: string
  powerup: PowerupKind
  targets: Array<string>
}

export type MultiplayerPhase =
  | 'connecting'
  | 'lobby'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'error'

export interface MultiplayerQuote {
  text: string
  author: string
  source: string
  language: string
  sourceUrl?: string
}

export interface Opponent {
  id: string
  wordIndex: number
  finished: boolean
  left: boolean
  rank?: number
  wpm?: number
}

export interface RaceResult {
  playerId: string
  rank: number
  elapsedMs: number
  wpm: number
}

// Mirrors backend/ws's serverMessage (see ws_messages.go) — only the fields this client actually
// reads, since every message type only populates a subset.
interface ServerMessage {
  type: string
  playerId?: string
  code?: string
  playersInRoom?: number
  minPlayers?: number
  maxPlayers?: number
  quote?: MultiplayerQuote
  wordCount?: number
  startsInMs?: number
  wordIndex?: number
  rank?: number
  elapsedMs?: number
  wpm?: number
  results?: Array<RaceResult>
  message?: string
  players?: Array<{ playerId: string; name?: string }>
  mode?: LobbyMode
  powerup?: PowerupKind
  targets?: Array<string>
}

function namesFrom(
  players: Array<{ playerId: string; name?: string }>,
): Record<string, string | undefined> {
  return Object.fromEntries(players.map((p) => [p.playerId, p.name]))
}

// useMultiplayerRace mirrors useTypingRace's word-lock input model (reject-wrong-chars,
// errorSeq flash, WPM/accuracy/progress math) exactly, so the same TypingWords/RaceTrack/Gauge
// components render either race identically — but can't just call useTypingRace itself: that
// hook picks its text once, synchronously, on mount (fine for solo, where the sentence/quote is
// known upfront). Here the quote only exists once the server's race_start message arrives,
// arbitrarily long after mount (however long the lobby wait takes) — so text has to be a plain
// reactive value this hook updates itself, not a lazy getter called once.
export function useMultiplayerRace() {
  // Sent as ?name= so opponents see who they're racing (see backend/ws's sanitizeName). Read at
  // connect time through a ref; the route gates wait for the user to load before connecting.
  const { user } = useCurrentUser()
  const nameRef = useRef(user?.name)
  nameRef.current = user?.name

  const [phase, setPhase] = useState<MultiplayerPhase>('connecting')
  const [myId, setMyId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [playersInRoom, setPlayersInRoom] = useState(0)
  const [minPlayers, setMinPlayers] = useState(2)
  const [maxPlayers, setMaxPlayers] = useState(5)
  const [quote, setQuote] = useState<MultiplayerQuote | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [startsInMs, setStartsInMs] = useState(0)
  // Opponent | undefined (not just Opponent) so indexing honestly reflects that a not-yet-seen
  // playerId isn't in the map — Record<string, T>'s index signature otherwise claims every key
  // resolves to a T, which doesn't match runtime reality here.
  const [opponents, setOpponents] = useState<
    Record<string, Opponent | undefined>
  >({})
  const [results, setResults] = useState<Array<RaceResult> | null>(null)
  // playerId → display name, for every player who connected with one.
  const [names, setNames] = useState<Record<string, string | undefined>>({})
  // How many players the race started with — the "of N" in a recorded placement. Fixed at
  // race_start, unlike playersInRoom, so a mid-race disconnect doesn't change it.
  const [racerCount, setRacerCount] = useState(0)
  const [mode, setMode] = useState<LobbyMode>('classic')
  // When we last fired our ability (null: not yet this race); it recharges after
  // ABILITY_RECHARGE_MS, which backend/ws enforces too.
  const [powerupUsedAt, setPowerupUsedAt] = useState<number | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [lastPowerup, setLastPowerup] = useState<PowerupEvent | null>(null)
  const powerupKeyRef = useRef(0)
  // Set the instant our own player_finished arrives — before race_end, which waits for every
  // still-connected player to finish (or the 5-minute cap). Our own rank is already final the
  // moment we cross the line; there's no reason to make the UI sit blank until race_end just
  // because someone else is still typing.
  const [myResult, setMyResult] = useState<RaceResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const text = quote?.text ?? ''
  const [typed, setTyped] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [totalTyped, setTotalTyped] = useState(0)
  const [totalMistakes, setTotalMistakes] = useState(0)
  const [errorSeq, setErrorSeq] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)

  const spans = useMemo(() => computeWordSpans(text), [text])
  const finished = finishedAt !== null
  const recorder = useReplayRecorder()

  useEffect(() => {
    if (!startedAt || finished) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [startedAt, finished])

  const elapsedMs = startedAt ? (finishedAt ?? now ?? startedAt) - startedAt : 0

  const correctChars = useMemo(() => {
    let count = 0
    for (const span of spans) {
      if (span.end > typed.length) break
      if (typed.slice(span.start, span.end) === span.word) {
        count += span.word.length + (span.end < text.length ? 1 : 0)
      }
    }
    return count
  }, [typed, text, spans])

  const minutes = elapsedMs / 60000
  const wpm =
    elapsedMs >= MIN_ELAPSED_FOR_WPM_MS && minutes > 0
      ? Math.round(correctChars / 5 / minutes)
      : 0

  const accuracy =
    totalTyped > 0
      ? Math.round(((totalTyped - totalMistakes) / totalTyped) * 100)
      : 100

  const activeWordIndex = Math.min(wordIndex, spans.length - 1)

  const progress = useMemo(() => {
    if (text.length === 0) return 0
    if (finished) return 1
    const word = spans[activeWordIndex]
    let correctPrefix = 0
    while (
      word.start + correctPrefix < typed.length &&
      correctPrefix < word.word.length &&
      typed[word.start + correctPrefix] === word.word[correctPrefix]
    ) {
      correctPrefix++
    }
    return (word.start + correctPrefix) / text.length
  }, [typed, text, spans, activeWordIndex, finished])

  function handleInputChange(value: string) {
    if (finished || phase !== 'racing') return
    const raceStart = startedAt ?? Date.now()
    if (!startedAt) setStartedAt(raceStart)

    const incoming = value.slice(0, text.length)

    if (incoming.length < typed.length) {
      const boundary = spans[activeWordIndex].start
      if (incoming.length < boundary) return
      setTyped(incoming)
      recorder.record(raceStart, incoming.length, false)
      return
    }

    if (incoming.length <= typed.length) return

    // Strict mode: wrong characters are silently rejected — the player must type the correct
    // key before anything advances. Matches useTypingRace's own model exactly.
    let next = typed
    let idx = activeWordIndex
    let newAttempts = 0
    let newMistakes = 0
    for (let i = typed.length; i < incoming.length; i++) {
      const char = incoming[i]
      const word = spans[idx]

      if (char === ' ') {
        newAttempts++
        if (next.slice(word.start) !== word.word) {
          newMistakes++
          continue
        }
        next += char
        idx = Math.min(idx + 1, spans.length - 1)
        continue
      }

      newAttempts++
      if (char !== text[next.length]) {
        newMistakes++
        continue
      }
      next += char
    }

    if (next.length === typed.length && newAttempts === 0) return

    recorder.record(raceStart, next.length, newMistakes > 0)
    setTotalTyped((count) => count + newAttempts)
    setTotalMistakes((count) => count + newMistakes)
    if (newMistakes > 0) {
      setErrorSeq((s) => s + 1)
    } else if (next.length > typed.length) {
      setErrorSeq(0)
    }

    setTyped(next)
    setWordIndex(idx)
    if (next.length >= text.length && next === text) {
      setFinishedAt(Date.now())
    }
  }

  // Boost/nitro: commits the next `count` words as if typed, exactly like useTypingRace's
  // skipWord. Read through a ref by the socket handler, which outlives any single render.
  const skipWords = (count: number) => {
    if (finished || text.length === 0) return
    const targetIndex = Math.min(activeWordIndex + count - 1, spans.length - 1)
    const word = spans[targetIndex]
    const isLast = targetIndex >= spans.length - 1
    const committed = text.slice(0, word.end) + (isLast ? '' : ' ')
    setTyped(committed)
    if (startedAt) recorder.record(startedAt, committed.length, false)
    if (isLast) {
      setFinishedAt(Date.now())
    } else {
      setWordIndex(targetIndex + 1)
    }
  }
  const skipWordsRef = useRef(skipWords)
  skipWordsRef.current = skipWords
  // Overdrive (see #/lib/powerups): each word we finish ourselves carries us one further, for a
  // while. `landedOn` is where our own bonus skip landed, so it doesn't chain on itself.
  const overdriveRef = useRef({ until: 0, left: 0, landedOn: -1 })
  const lastWordRef = useRef(activeWordIndex)
  useEffect(() => {
    const prev = lastWordRef.current
    lastWordRef.current = activeWordIndex
    const od = overdriveRef.current
    if (activeWordIndex <= prev || activeWordIndex === od.landedOn) return
    if (od.left <= 0 || Date.now() > od.until) return
    od.left -= 1
    od.landedOn = activeWordIndex + 1
    skipWordsRef.current(1)
  }, [activeWordIndex])

  const slipstreamWordsRef = useRef((): number => 1)
  slipstreamWordsRef.current = () => {
    const ahead = Object.values(opponents)
      .filter((o): o is Opponent => o !== undefined && !o.finished)
      .map((o) => o.wordIndex)
      .filter((w) => w > activeWordIndex)
    if (ahead.length === 0) return 1
    return Math.min(
      SLIPSTREAM_MAX_WORDS,
      Math.max(1, Math.min(...ahead) - activeWordIndex),
    )
  }

  const socketRef = useRef<WebSocket | null>(null)
  const finishSentRef = useRef(false)
  // ws.onmessage is a long-lived closure set up once per connection — reading React state
  // (myId) from inside it sees whatever myId was at the moment the closure was created, not
  // later updates, since myId isn't (and shouldn't be) a dependency that recreates the
  // connection. A ref, updated synchronously in the same 'welcome' handler that sets myId
  // state, is what lets later messages in that same closure compare against the current value.
  const myIdRef = useRef<string | null>(null)

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }, [])

  const resetRoomState = useCallback(() => {
    setIsHost(false)
    setCode(null)
    setPlayersInRoom(0)
    setQuote(null)
    setWordCount(0)
    setStartsInMs(0)
    setOpponents({})
    setNames({})
    setRacerCount(0)
    setMode('classic')
    setPowerupUsedAt(null)
    setLastPowerup(null)
    overdriveRef.current = { until: 0, left: 0, landedOn: -1 }
    setResults(null)
    setMyResult(null)
    setErrorMessage(null)
    finishSentRef.current = false
    setTyped('')
    setWordIndex(0)
    setTotalTyped(0)
    setTotalMistakes(0)
    setErrorSeq(0)
    setStartedAt(null)
    setFinishedAt(null)
    setNow(null)
    recorder.reset()
  }, [recorder])

  const connect = useCallback(
    (path: string) => {
      socketRef.current?.close()
      resetRoomState()
      setPhase('connecting')

      const target = new URL(`${WS_URL}${path}`)
      if (nameRef.current) target.searchParams.set('name', nameRef.current)
      const url = target.toString()
      const ws = new WebSocket(url)
      socketRef.current = ws

      // Dev-mode mounts an effect twice (mount → cleanup → mount again) to catch missing
      // cleanup — entirely normal, and the earlier connect()'s own socketRef.current?.close()
      // above already handles it by opening a fresh socket for the second, real mount. What
      // isn't safe by default is this closure: it's still alive after being superseded, and a
      // stale socket's belated message/close events would otherwise clobber state a newer
      // connection has already moved past. Every handler below checks this first.
      const isCurrent = () => socketRef.current === ws

      // The "Lost connection to the race server" screen only tells the player a close
      // happened, not why — these three log the actual WebSocket lifecycle (open, error, and
      // the close code/reason, per MDN's CloseEvent) so a misconfigured VITE_WS_URL, CORS
      // rejection, or a real server-side drop are distinguishable from the browser console.
      ws.onopen = () => {
        if (!isCurrent()) return
        console.log(`[multiplayer] connected to ${url}`)
      }

      ws.onerror = (event) => {
        if (!isCurrent()) return
        console.error(`[multiplayer] WebSocket error on ${url}:`, event)
      }

      ws.onmessage = (event) => {
        if (!isCurrent()) return
        let msg: ServerMessage
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        switch (msg.type) {
          case 'welcome':
            myIdRef.current = msg.playerId ?? null
            setMyId(msg.playerId ?? null)
            setPhase('lobby')
            break
          case 'host_assigned':
            setIsHost(true)
            break
          case 'waiting':
            if (msg.players) setNames(namesFrom(msg.players))
            if (msg.mode) setMode(msg.mode)
            setCode(msg.code || null)
            setPlayersInRoom(msg.playersInRoom ?? 0)
            setMinPlayers(msg.minPlayers ?? 2)
            setMaxPlayers(msg.maxPlayers ?? 5)
            break
          case 'race_start':
            if (msg.players) {
              const players = msg.players
              setNames(namesFrom(players))
              setRacerCount(players.length)
              // Everyone in the room gets a car on the grid now, at the line, before the quote
              // shows — not only once their first progress update arrives.
              setOpponents((prev) => {
                const next = { ...prev }
                for (const player of players) {
                  const id = player.playerId
                  if (id === myIdRef.current || next[id]) continue
                  next[id] = {
                    id,
                    wordIndex: 0,
                    finished: false,
                    left: false,
                  }
                }
                return next
              })
            }
            if (msg.quote) setQuote(msg.quote)
            setWordCount(msg.wordCount ?? 0)
            setStartsInMs(msg.startsInMs ?? 0)
            setPhase('countdown')
            break
          case 'go':
            setPhase('racing')
            setStartedAt((current) => current ?? Date.now())
            break
          case 'player_progress':
            // The server already excludes us from this one (see backend/ws's
            // broadcastExcept), but guard anyway for symmetry with player_finished below.
            if (!msg.playerId || msg.playerId === myIdRef.current) break
            setOpponents((prev) => ({
              ...prev,
              [msg.playerId!]: {
                id: msg.playerId!,
                wordIndex: msg.wordIndex ?? 0,
                finished: prev[msg.playerId!]?.finished ?? false,
                left: prev[msg.playerId!]?.left ?? false,
                rank: prev[msg.playerId!]?.rank,
                wpm: prev[msg.playerId!]?.wpm,
              },
            }))
            break
          case 'player_finished':
            if (!msg.playerId) break
            // Unlike player_progress, this one IS relayed to the whole room including the
            // finisher (see ws_messages.go's protocol doc) — that's how we learn our own rank
            // the instant we cross the line, without waiting for race_end (which needs everyone
            // done). It must not also become a second "self" entry in the opponents map, though.
            if (msg.playerId === myIdRef.current) {
              setMyResult({
                playerId: msg.playerId,
                rank: msg.rank ?? 0,
                elapsedMs: msg.elapsedMs ?? 0,
                wpm: msg.wpm ?? 0,
              })
              break
            }
            setOpponents((prev) => ({
              ...prev,
              [msg.playerId!]: {
                id: msg.playerId!,
                wordIndex: prev[msg.playerId!]?.wordIndex ?? 0,
                finished: true,
                left: prev[msg.playerId!]?.left ?? false,
                rank: msg.rank,
                wpm: msg.wpm,
              },
            }))
            break
          case 'player_left':
            if (!msg.playerId) break
            setOpponents((prev) => {
              const existing = prev[msg.playerId!]
              if (!existing) return prev
              return { ...prev, [msg.playerId!]: { ...existing, left: true } }
            })
            break
          case 'powerup_used': {
            if (!msg.playerId || !msg.powerup) break
            powerupKeyRef.current += 1
            const fired: PowerupEvent = {
              key: powerupKeyRef.current,
              playerId: msg.playerId,
              powerup: msg.powerup,
              targets: msg.targets ?? [],
            }
            setLastPowerup(fired)
            if (msg.playerId === myIdRef.current) {
              setPowerupUsedAt(Date.now())
              // Applied here, once the server has confirmed it (see useSoloPowerups for the
              // same abilities in solo).
              switch (msg.powerup) {
                case 'boost':
                  skipWordsRef.current(1)
                  break
                case 'nitro':
                  skipWordsRef.current(2)
                  break
                case 'slipstream':
                  skipWordsRef.current(slipstreamWordsRef.current())
                  break
                case 'overdrive':
                  overdriveRef.current = {
                    until: Date.now() + OVERDRIVE_MS,
                    left: OVERDRIVE_MAX_WORDS,
                    landedOn: -1,
                  }
                  break
              }
            }
            break
          }
          case 'race_end':
            setResults(msg.results ?? [])
            setPhase('finished')
            break
          case 'error':
            setErrorMessage(msg.message ?? 'Something went wrong.')
            setPhase('error')
            break
        }
      }

      ws.onclose = (event) => {
        if (!isCurrent()) return
        console.log(
          `[multiplayer] disconnected from ${url} (code=${event.code}, reason=${event.reason || '(none)'}, clean=${event.wasClean})`,
        )
        // race_end always closes the socket ~10s later (see backend/ws's finishRace) — that's
        // an expected, successful end, not a connection failure, so only fall back to an error
        // state from a phase that wasn't already a deliberate terminal one.
        setPhase((current) =>
          current === 'finished' || current === 'error' ? current : 'error',
        )
      }
    },
    [resetRoomState],
  )

  const quickMatch = useCallback(
    (lobby: LobbyMode) => connect(`/ws/race?mode=${lobby}`),
    [connect],
  )
  const createRoom = useCallback(
    (lobby: LobbyMode) => connect(`/ws/private/create?mode=${lobby}`),
    [connect],
  )

  // Fires our equipped powerup. Nothing happens locally until the server confirms it with
  // powerup_used (handled above) — that's what enforces once per race, and it means a boost
  // and the freeze it might trigger elsewhere always line up.
  // Ticks while our ability recharges, so the item box fills up smoothly.
  useEffect(() => {
    if (powerupUsedAt === null || phase !== 'racing') return
    const id = setInterval(() => setClock(Date.now()), 100)
    return () => clearInterval(id)
  }, [powerupUsedAt, phase])
  const powerupCharge =
    powerupUsedAt === null
      ? 1
      : Math.min(1, (clock - powerupUsedAt) / ABILITY_RECHARGE_MS)
  const powerupReady = powerupCharge >= 1

  const firePowerup = useCallback(
    (kind: PowerupKind) => {
      if (!powerupReady || phase !== 'racing' || finished) return
      send({ type: 'powerup', powerup: kind })
    },
    [powerupReady, phase, finished, send],
  )
  const joinRoom = useCallback(
    (joinCode: string) =>
      connect(
        `/ws/private/join?code=${encodeURIComponent(joinCode.trim().toUpperCase())}`,
      ),
    [connect],
  )

  const startNow = useCallback(() => send({ type: 'start' }), [send])

  const leave = useCallback(() => {
    const ws = socketRef.current
    socketRef.current = null
    resetRoomState()
    ws?.close()
  }, [resetRoomState])

  // Report our own progress to the room whenever a new word is committed while racing — see
  // README's "progress" message: purely cosmetic for opponents' UI, so this only needs to fire
  // on word boundaries, not every keystroke.
  useEffect(() => {
    if (phase !== 'racing') return
    send({ type: 'progress', wordIndex: activeWordIndex })
  }, [phase, activeWordIndex, send])

  // Report finishing exactly once — finished flips permanently true the instant the last word
  // is committed, so a ref (not state) guards against a stray extra render sending it twice.
  useEffect(() => {
    if (phase === 'racing' && finished && !finishSentRef.current) {
      finishSentRef.current = true
      send({ type: 'finish', elapsedMs })
    }
  }, [phase, finished, elapsedMs, send])

  useEffect(() => {
    return () => {
      socketRef.current?.close()
    }
  }, [])

  const getReplay = useCallback(() => recorder.snapshot(text), [recorder, text])

  return {
    phase,
    myId,
    isHost,
    code,
    playersInRoom,
    minPlayers,
    maxPlayers,
    quote,
    wordCount,
    startsInMs,
    opponents: Object.values(opponents).filter(
      (o): o is Opponent => o !== undefined,
    ),
    results,
    myResult,
    names,
    racerCount,
    mode,
    powerupReady,
    powerupCharge,
    lastPowerup,
    firePowerup,
    errorMessage,
    quickMatch,
    createRoom,
    joinRoom,
    startNow,
    leave,
    text,
    spans,
    typed,
    activeWordIndex,
    finished,
    started: startedAt !== null,
    elapsedMs,
    wpm,
    accuracy,
    progress,
    errorSeq,
    handleInputChange,
    getReplay,
  }
}
