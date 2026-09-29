import { useEffect, useRef, useState } from 'react'
import { cn } from '#/lib/utils'
import type { RefObject } from 'react'

function ActiveWord({ word, typed }: { word: string; typed: string }) {
  const chars = word.split('')
  const overflow = typed.length > word.length ? typed.slice(word.length) : ''
  return (
    <span className="race-word">
      {chars.map((char, i) => {
        const className =
          i >= typed.length
            ? 'race-char-pending'
            : typed[i] === char
              ? 'race-char-correct'
              : 'race-char-incorrect'
        return (
          <span key={i} className={className}>
            {char}
          </span>
        )
      })}
      {overflow.split('').map((char, i) => (
        <span key={`overflow-${i}`} className="race-char-incorrect">
          {char}
        </span>
      ))}
    </span>
  )
}

interface LeavingWord {
  id: number
  word: string
  collapsed: boolean
}

// How long the collapse transition runs — kept in sync with the CSS transition duration on
// .word-stream-leaving (see styles.css) so a leaving word is removed from the DOM exactly when
// it's finished shrinking away, not before (a visible jump) or long after (wasted DOM nodes).
const LEAVE_MS = 260

// The current word is rendered live (char-by-char coloring); every other word is a plain queued
// span, all in a single non-wrapping horizontal row (word-stream-track) — the classic
// 10fastfingers feel of one line of words scrolling past, not a multi-line paragraph. When the
// current word commits, it doesn't just vanish from the row (an abrupt jump as everything after
// it snaps left) — it's kept rendered for one extra beat as a "leaving" word whose box smoothly
// collapses to zero width, so the rest of the line visibly glides left to fill the gap.
export default function WordStream({
  queue,
  typed,
  onInputChange,
  inputRef,
}: {
  queue: Array<string>
  typed: string
  onInputChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const [leaving, setLeaving] = useState<Array<LeavingWord>>([])
  // Explicitly string | undefined: queue starts as [] before useWordStream's mount effect
  // populates it, so queue[0] is genuinely undefined at first even though Array<string>'s own
  // type doesn't say so.
  const prevFirstRef = useRef<string | undefined>(queue[0])
  const nextIdRef = useRef(0)

  useEffect(() => {
    const prevFirst = prevFirstRef.current
    prevFirstRef.current = queue[0]
    // Only fires on a real commit (the front of the queue advanced), not on every keystroke —
    // and not on the very first queue population after mount (prevFirst undefined).
    if (prevFirst === undefined || prevFirst === queue[0]) return

    const id = nextIdRef.current++
    setLeaving((prev) => [...prev, { id, word: prevFirst, collapsed: false }])

    // Mounts at full width first, then flips to collapsed a frame later so the browser has an
    // actual "before" state to transition away from — applying both in the same tick would jump
    // straight to collapsed with no visible transition at all. Each leaving word manages its own
    // independent timer rather than one tied to this effect's cleanup, since a fast typist can
    // have several words collapsing at once (a later commit's re-run must not cancel an earlier
    // word's still-running animation).
    requestAnimationFrame(() => {
      setLeaving((prev) =>
        prev.map((w) => (w.id === id ? { ...w, collapsed: true } : w)),
      )
    })
    setTimeout(() => {
      setLeaving((prev) => prev.filter((w) => w.id !== id))
    }, LEAVE_MS)
  }, [queue])

  return (
    <button
      type="button"
      className="race-words relative block w-full cursor-text rounded-lg p-5 text-left"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="word-stream-track">
        {leaving.map(({ id, word, collapsed }) => (
          <span
            key={`leaving-${id}`}
            aria-hidden="true"
            className={cn(
              'race-word race-word-pending word-stream-leaving',
              collapsed && 'word-stream-leaving--collapsed',
            )}
          >
            {word}
          </span>
        ))}
        {queue.map((word, i) =>
          i === 0 ? (
            <ActiveWord key="active" word={word} typed={typed} />
          ) : (
            <span key={`${i}-${word}`} className="race-word race-word-pending">
              {word}
            </span>
          ),
        )}
      </div>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="sr-only"
        value={typed}
        onChange={(event) => onInputChange(event.target.value)}
        aria-label="Type the highlighted word"
      />
    </button>
  )
}
