import { useEffect, useMemo, useRef, useState } from 'react'
import { getRandomSentence } from './sentences'

const TICK_MS = 100
// Below this, elapsed time is too noisy to extrapolate into a per-minute
// rate — a tiny denominator turns small timing jitter into a huge WPM spike.
const MIN_ELAPSED_FOR_WPM_MS = 1500
// How many extra (wrong) characters you can pile onto a word before further
// keystrokes are ignored.
const MAX_OVERFLOW_CHARS = 20

export interface WordSpan {
  word: string
  start: number
  end: number
}

export function computeWordSpans(text: string): Array<WordSpan> {
  const spans: Array<WordSpan> = []
  let pos = 0
  for (const word of text.split(' ')) {
    spans.push({ word, start: pos, end: pos + word.length })
    pos += word.length + 1
  }
  return spans
}

export function useTypingRace(
  getText: (exclude?: string) => string = getRandomSentence,
) {
  // Starts empty rather than calling getText() directly in useState's
  // initializer — that would run once during SSR and again on client
  // hydration, and a Math.random()-backed generator gives two different
  // strings each time, which is a hydration mismatch. Real text is
  // generated client-side only, right after mount.
  const getTextRef = useRef(getText)
  getTextRef.current = getText
  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  // Which word is "current" is tracked as its own piece of state, advanced
  // only by an explicit, verified space-commit — never re-derived from raw
  // caret/typed.length. Deriving it from length let overflow characters
  // drift the caret past later (uncommitted) word boundaries, which made
  // those words look "passed" — e.g. holding one wrong key down for long
  // enough would silently count words as done and move the race car.
  const [wordIndex, setWordIndex] = useState(0)
  const [totalTyped, setTotalTyped] = useState(0)
  const [totalMistakes, setTotalMistakes] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)

  const spans = useMemo(() => computeWordSpans(text), [text])
  const finished = finishedAt !== null

  useEffect(() => {
    setText(getTextRef.current())
  }, [])

  useEffect(() => {
    if (!startedAt || finished) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [startedAt, finished])

  const elapsedMs = startedAt ? (finishedAt ?? now ?? startedAt) - startedAt : 0

  // WPM only credits characters from fully-and-correctly-typed words, not
  // partial credit for correct characters inside a word that has an error
  // elsewhere — matching how Monkeytype/typing-test conventions count it.
  // (Committed words are always exactly correct under this word-lock model,
  // so in practice this just sums every committed word's length.)
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

  // Progress (and therefore the race car) only advances on characters that
  // are actually correct so far — a committed word's full length, plus a
  // running-correct prefix within the word currently being typed. Wrong or
  // overflow characters (e.g. holding down one key) contribute nothing, so
  // there's no way to fake forward motion without actually typing it right.
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
    if (finished) return
    if (!startedAt) setStartedAt(Date.now())

    const incoming = value.slice(0, text.length)

    if (incoming.length < typed.length) {
      // Once a word is committed (typed correctly, then space/finish), it's
      // locked — backspacing can fix the word you're currently on, but not
      // reach back into an already-submitted one. Matches TypeRacer.
      const boundary = spans[activeWordIndex].start
      if (incoming.length < boundary) return
      setTyped(incoming)
      return
    }

    if (incoming.length <= typed.length) return

    // Walk the newly typed characters one at a time, tracking the active
    // word index ourselves as we go — it only moves forward when a space
    // is typed AND the word typed so far matches exactly.
    let next = typed
    let idx = activeWordIndex
    for (let i = typed.length; i < incoming.length; i++) {
      const char = incoming[i]
      const word = spans[idx]
      const segmentLength = next.length - word.start

      if (char === ' ') {
        if (next.slice(word.start) !== word.word) continue
        next += char
        idx = Math.min(idx + 1, spans.length - 1)
        continue
      }

      if (segmentLength >= word.word.length + MAX_OVERFLOW_CHARS) continue
      next += char
    }

    if (next.length === typed.length) return

    let newMistakes = 0
    for (let i = typed.length; i < next.length; i++) {
      if (next[i] !== text[i]) newMistakes++
    }
    setTotalTyped((count) => count + (next.length - typed.length))
    setTotalMistakes((count) => count + newMistakes)

    setTyped(next)
    setWordIndex(idx)
    if (next.length >= text.length && next === text) {
      setFinishedAt(Date.now())
    }
  }

  function reset() {
    setText((current) => getTextRef.current(current))
    setTyped('')
    setWordIndex(0)
    setTotalTyped(0)
    setTotalMistakes(0)
    setStartedAt(null)
    setFinishedAt(null)
    setNow(null)
  }

  return {
    text,
    spans,
    typed,
    activeWordIndex,
    finished,
    started: startedAt !== null,
    startedAt,
    elapsedMs,
    wpm,
    accuracy,
    progress,
    handleInputChange,
    reset,
  }
}
