import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '#/lib/utils'
import type { RefObject } from 'react'
import type { WordSpan } from '#/lib/typing/useTypingRace'

type WordState = 'pending' | 'active' | 'correct'

function Word({
  span,
  typed,
  state,
}: {
  span: WordSpan
  typed: string
  state: WordState
}) {
  if (state === 'active') {
    const chars = span.word.split('')
    const caretPos = typed.length - span.start
    const overflow = typed.length > span.end ? typed.slice(span.end) : ''
    return (
      <span className="race-word">
        {chars.map((char, i) => {
          const index = span.start + i
          const className =
            index >= typed.length
              ? 'race-char-pending'
              : typed[index] === char
                ? 'race-char-correct'
                : 'race-char-incorrect'
          return (
            <Fragment key={i}>
              {i === caretPos && <span data-caret-marker="" />}
              <span className={className}>{char}</span>
            </Fragment>
          )
        })}
        {overflow.split('').map((char, i) => (
          <span key={`overflow-${i}`} className="race-char-incorrect">
            {char}
          </span>
        ))}
        {caretPos >= chars.length && <span data-caret-marker="" />}
      </span>
    )
  }

  return <span className={`race-word race-word-${state}`}>{span.word}</span>
}

// The same flowing word-by-word display used by the race screen — reused
// here by the practice drill too, rather than a bespoke widget, so both
// look and behave identically.
export default function TypingWords({
  spans,
  typed,
  activeWordIndex,
  finished,
  locked,
  onInputChange,
  inputRef,
  overlay,
  className,
}: {
  spans: Array<WordSpan>
  typed: string
  activeWordIndex: number
  finished: boolean
  locked?: boolean
  onInputChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  overlay?: React.ReactNode
  className?: string
}) {
  const wordsRef = useRef<HTMLButtonElement>(null)
  const [caretPos, setCaretPos] = useState<{ x: number; y: number } | null>(
    null,
  )

  useLayoutEffect(() => {
    const container = wordsRef.current
    const marker = container?.querySelector('[data-caret-marker]')
    if (!container || !marker) {
      setCaretPos(null)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    setCaretPos({
      x: markerRect.left - containerRect.left,
      y: markerRect.top - containerRect.top,
    })
  }, [typed, activeWordIndex, finished])

  return (
    <button
      ref={wordsRef}
      type="button"
      className={cn(
        'race-words relative block w-full cursor-text rounded-lg p-5 text-left',
        className,
      )}
      onClick={() => {
        if (!locked && !finished) inputRef.current?.focus()
      }}
    >
      {spans.map((span, index) => {
        // Words are only ever committed once typed exactly right, so
        // anything behind the active word (or the whole passage, once
        // finished) is always correct — no incorrect-and-locked state.
        const state: WordState =
          index === activeWordIndex && !finished
            ? 'active'
            : index < activeWordIndex || finished
              ? 'correct'
              : 'pending'
        return <Word key={index} span={span} typed={typed} state={state} />
      })}
      {caretPos && !finished && !locked && (
        <span
          className="race-caret"
          style={{
            transform: `translate(${caretPos.x}px, ${caretPos.y}px)`,
          }}
        />
      )}
      {overlay}
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={locked}
        className="sr-only"
        value={typed}
        onChange={(event) => onInputChange(event.target.value)}
        aria-label="Type the passage"
      />
    </button>
  )
}
