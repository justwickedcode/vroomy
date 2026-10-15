import type { ReplayEvent } from '#/lib/api/types'
import type { WordSpan } from '#/lib/typing/useTypingRace'

// Same threshold as the live race hooks — below it, WPM extrapolation is noise.
const MIN_ELAPSED_FOR_WPM_MS = 1500

export interface PlaybackFrame {
  typed: string
  activeWordIndex: number
  // Consecutive rejected keystrokes at this moment — feeds TypingWords' error flash exactly as
  // the live race's errorSeq does (0 clears it, any change retriggers it).
  errorSeq: number
  wpm: number
  progress: number
  finished: boolean
}

// Index of the last event at or before t, or -1 if t is before the first one.
function eventIndexAt(events: Array<ReplayEvent>, t: number): number {
  let lo = 0
  let hi = events.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (events[mid][0] <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

// frameAt reconstructs what the race screen showed t ms after the start. Because the game only
// ever accepts correct characters, the typed text is always a prefix of the passage, and the
// active word is simply how many words have been committed with a space — the same values the
// live hooks track, derived from one number.
export function frameAt(
  passage: string,
  spans: Array<WordSpan>,
  events: Array<ReplayEvent>,
  t: number,
): PlaybackFrame {
  const index = eventIndexAt(events, t)
  const length = index >= 0 ? events[index][1] : 0
  const typed = passage.slice(0, length)

  // correctChars mirrors the live hooks' WPM numerator (every fully typed word, counted as soon
  // as its last letter is in); committedWords only counts a word once its space is typed too,
  // which is when the live race moves the active word on.
  let committedWords = 0
  let correctChars = 0
  for (const span of spans) {
    if (span.end > length) break
    const isLast = span.end === passage.length
    correctChars += span.word.length + (isLast ? 0 : 1)
    if (isLast || length > span.end) committedWords++
  }

  let errorSeq = 0
  for (let i = index; i >= 0 && events[i][2] === 1; i--) errorSeq++

  const minutes = t / 60000
  const wpm =
    t >= MIN_ELAPSED_FOR_WPM_MS ? Math.round(correctChars / 5 / minutes) : 0

  return {
    typed,
    activeWordIndex: Math.min(committedWords, spans.length - 1),
    errorSeq,
    wpm,
    progress: passage.length > 0 ? length / passage.length : 0,
    finished: length === passage.length && passage.length > 0,
  }
}
