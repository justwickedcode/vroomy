import { Fragment, useRef } from 'react'
import { cn } from '#/lib/utils'
import type { RefObject } from 'react'
import type { WordSpan } from '#/lib/typing/useTypingRace'

type WordState = 'pending' | 'active' | 'correct'

// Space character between words — highlighted when it's the next key to press
function SpaceChar({
  span,
  isActiveWord,
  typed,
  errorSeq = 0,
}: {
  span: WordSpan
  isActiveWord: boolean
  typed: string
  errorSeq?: number
}) {
  const spaceTyped = typed.length > span.end
  const waitingForSpace = isActiveWord && typed.length === span.end
  const hasError = waitingForSpace && errorSeq > 0

  let cls = 'race-char-space'
  if (spaceTyped) cls += ' race-char-correct'
  else if (waitingForSpace)
    cls += hasError
      ? ' race-char-current race-char-current--error'
      : ' race-char-current'
  else cls += ' race-char-pending'

  return (
    <>
      {waitingForSpace && (
        <span key={errorSeq} data-caret-marker={hasError ? 'error' : ''} />
      )}
      <span className={cls}>&nbsp;</span>
    </>
  )
}

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
    const wordFullyTyped = caretPos >= chars.length
    return (
      <span className="race-word race-word-active">
        {chars.map((char, i) => {
          const index = span.start + i
          let className: string
          if (index < typed.length) {
            className = 'race-char-correct'
          } else if (i === caretPos) {
            className = hasError
              ? 'race-char-current race-char-current--error'
              : 'race-char-current'
          } else {
            className = 'race-char-pending'
          }
          return (
            <Fragment key={i}>
              {i === caretPos && !wordFullyTyped && (
                <span
                  key={errorSeq}
                  data-caret-marker={hasError ? 'error' : ''}
                />
              )}
              <span className={className}>{char}</span>
            </Fragment>
          )
        })}
      </span>
    )
  }

  return <span className={`race-word race-word-${state}`}>{span.word}</span>
}

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
      <div
        className={cn(
          'race-words-inner',
          locked && 'race-words-inner--blurred',
        )}
      >
        {spans.map((span, index) => {
          const isLast = index === spans.length - 1
          const state: WordState =
            index === activeWordIndex && !finished
              ? 'active'
              : index < activeWordIndex || finished
                ? 'correct'
                : 'pending'
          return (
            <Fragment key={index}>
              <Word
                span={span}
                typed={typed}
                state={state}
                errorSeq={state === 'active' ? errorSeq : 0}
              />
              {!isLast && (
                <SpaceChar
                  span={span}
                  isActiveWord={state === 'active'}
                  typed={typed}
                  errorSeq={state === 'active' ? errorSeq : 0}
                />
              )}
            </Fragment>
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
