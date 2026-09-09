import { Fragment, useRef } from 'react'
import { cn } from '#/lib/utils'
import type { RefObject } from 'react'
import type { WordSpan } from '#/lib/typing/useTypingRace'

type WordState = 'pending' | 'active' | 'correct'

function Word({
  span,
  typed,
  state,
  errorSeq = 0,
}: {
  span: WordSpan
  typed: string
  state: WordState
  errorSeq?: number
}) {
  if (state === 'active') {
    const chars = span.word.split('')
    const caretPos = typed.length - span.start
    const hasError = errorSeq > 0
    return (
      <span className="race-word race-word-active">
        {chars.map((char, i) => {
          const index = span.start + i
          const className =
            index >= typed.length ? 'race-char-pending' : 'race-char-correct'
          return (
            <Fragment key={i}>
              {i === caretPos && (
                <span
                  key={errorSeq}
                  data-caret-marker={hasError ? 'error' : ''}
                />
              )}
              <span className={className}>{char}</span>
            </Fragment>
          )
        })}
        {caretPos >= chars.length && (
          <span key={errorSeq} data-caret-marker={hasError ? 'error' : ''} />
        )}
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
  errorSeq = 0,
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
  errorSeq?: number
  onInputChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  overlay?: React.ReactNode
  className?: string
}) {
  const wordsRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={wordsRef}
      role="button"
      tabIndex={0}
      className={cn(
        'race-words relative block w-full cursor-text rounded-lg p-5 text-left',
        className,
      )}
      onClick={() => {
        if (!locked && !finished) inputRef.current?.focus()
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        if (!locked && !finished) inputRef.current?.focus()
      }}
    >
      <div className="race-words-inner">
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
          return (
            <Word
              key={index}
              span={span}
              typed={typed}
              state={state}
              errorSeq={state === 'active' ? errorSeq : 0}
            />
          )
        })}
      </div>
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
    </div>
  )
}
