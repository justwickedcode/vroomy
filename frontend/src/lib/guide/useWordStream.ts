import { useEffect, useState } from 'react'
import { randomWord } from './drillWords'

const TICK_MS = 100
const MIN_ELAPSED_FOR_WPM_MS = 1500
// How many extra (wrong) characters you can pile onto a word before further
// keystrokes are ignored — matches the race's overflow cap.
const MAX_OVERFLOW_CHARS = 15
// How many upcoming words stay on screen at once. The finished word drops
// off the front and a fresh one is appended to the back — the classic
// 10fastfingers "words scroll past" feel, rather than a fixed passage.
export const WINDOW_SIZE = 14

function freshQueue() {
  const queue: Array<string> = []
  for (let i = 0; i < WINDOW_SIZE; i++) {
    queue.push(randomWord(queue[queue.length - 1]))
  }
  return queue
}

export function useWordStream() {
  // Starts empty rather than calling freshQueue() directly in useState's
  // initializer — Math.random() would run once during SSR and again on
  // client hydration and produce two different queues, a hydration
  // mismatch. The real queue is generated client-side only, after mount.
  const [queue, setQueue] = useState<Array<string>>([])
  const [typed, setTyped] = useState('')
  const [completed, setCompleted] = useState(0)
  const [correctChars, setCorrectChars] = useState(0)
  const [totalTyped, setTotalTyped] = useState(0)
  const [totalMistakes, setTotalMistakes] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setQueue(freshQueue())
  }, [])

  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [startedAt])

  const elapsedMs = startedAt ? (now ?? startedAt) - startedAt : 0
  const minutes = elapsedMs / 60000
  const wpm =
    elapsedMs >= MIN_ELAPSED_FOR_WPM_MS && minutes > 0
      ? Math.round(correctChars / 5 / minutes)
      : 0
  const accuracy =
    totalTyped > 0
      ? Math.round(((totalTyped - totalMistakes) / totalTyped) * 100)
      : 100

  function handleInputChange(value: string) {
    const currentWord = queue[0]
    if (!currentWord) return
    if (!startedAt) setStartedAt(Date.now())

    // Only the current (first) word can be edited — once a word scrolls
    // off there's nothing left on screen to backspace into.
    if (value.length < typed.length) {
      setTyped(value)
      return
    }
    if (value.length <= typed.length) return

    const added = value.slice(typed.length)
    let next = typed
    let committed = false
    for (const char of added) {
      if (char === ' ') {
        if (next !== currentWord) continue
        setQueue((q) => {
          const rest = q.slice(1)
          return [...rest, randomWord(rest[rest.length - 1])]
        })
        setCompleted((c) => c + 1)
        setCorrectChars((c) => c + currentWord.length + 1)
        committed = true
        break
      }
      if (next.length >= currentWord.length + MAX_OVERFLOW_CHARS) continue
      next += char
    }

    if (committed) {
      setTyped('')
      return
    }
    if (next === typed) return

    setTotalTyped((t) => t + (next.length - typed.length))
    let mistakes = 0
    for (let i = typed.length; i < next.length; i++) {
      if (next[i] !== currentWord[i]) mistakes++
    }
    setTotalMistakes((m) => m + mistakes)
    setTyped(next)
  }

  function reset() {
    setQueue(freshQueue())
    setTyped('')
    setCompleted(0)
    setCorrectChars(0)
    setTotalTyped(0)
    setTotalMistakes(0)
    setStartedAt(null)
    setNow(null)
  }

  return {
    queue,
    typed,
    completed,
    wpm,
    accuracy,
    handleInputChange,
    reset,
  }
}
