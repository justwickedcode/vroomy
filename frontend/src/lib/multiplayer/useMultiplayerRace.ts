import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeWordSpans } from '#/lib/typing/useTypingRace'

// Talks to backend/ws (a separate Go service — see backend/ws/README.md) over a raw WebSocket,
// not fetch/TanStack Query: this is a stateful, long-lived, server-pushed session (matchmaking,
// countdown, live opponent progress), not a one-shot request/response.
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8081'

const TICK_MS = 100
// Below this, elapsed time is too noisy to extrapolate into a per-minute rate — matches
// useTypingRace's own threshold, since both feed the same Gauge display.
const MIN_ELAPSED_FOR_WPM_MS = 1500

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
}

// useMultiplayerRace mirrors useTypingRace's word-lock input model (reject-wrong-chars,
// errorSeq flash, WPM/accuracy/progress math) exactly, so the same TypingWords/RaceTrack/Gauge
// components render either race identically — but can't just call useTypingRace itself: that
// hook picks its text once, synchronously, on mount (fine for solo, where the sentence/quote is
// known upfront). Here the quote only exists once the server's race_start message arrives,
// arbitrarily long after mount (however long the lobby wait takes) — so text has to be a plain
// reactive value this hook updates itself, not a lazy getter called once.
export function useMultiplayerRace() {
  const [phase, setPhase] = useState<MultiplayerPhase>('connecting')
  const [myId, setMyId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [playersInRoom, setPlayersInRoom] = useState(0)
  const [minPlayers, setMinPlayers] = useState(2)
  const [maxPlayers, setMaxPlayers] = useState(6)
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
    if (!startedAt) setStartedAt(Date.now())

    const incoming = value.slice(0, text.length)

    if (incoming.length < typed.length) {
      const boundary = spans[activeWordIndex].start
      if (incoming.length < boundary) return
      setTyped(incoming)
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
  }, [])

  const connect = useCallback(
    (path: string) => {
      socketRef.current?.close()
      resetRoomState()
      setPhase('connecting')

      const ws = new WebSocket(`${WS_URL}${path}`)
      socketRef.current = ws

      // Dev-mode mounts an effect twice (mount → cleanup → mount again) to catch missing
      // cleanup — entirely normal, and the earlier connect()'s own socketRef.current?.close()
      // above already handles it by opening a fresh socket for the second, real mount. What
      // isn't safe by default is this closure: it's still alive after being superseded, and a
      // stale socket's belated message/close events would otherwise clobber state a newer
      // connection has already moved past. Every handler below checks this first.
      const isCurrent = () => socketRef.current === ws

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
            setCode(msg.code || null)
            setPlayersInRoom(msg.playersInRoom ?? 0)
            setMinPlayers(msg.minPlayers ?? 2)
            setMaxPlayers(msg.maxPlayers ?? 6)
            break
          case 'race_start':
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

      ws.onclose = () => {
        if (!isCurrent()) return
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

  const quickMatch = useCallback(() => connect('/ws/race'), [connect])
  const createRoom = useCallback(() => connect('/ws/private/create'), [connect])
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
  }
}
