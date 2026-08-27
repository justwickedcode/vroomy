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

// The current word is rendered live (char-by-char coloring); every other
// word is a plain queued span. When the current word commits, it's simply
// dropped from the `queue` array and a new one appended at the end — React
// reconciles that as the word disappearing and the next one sliding into
// its place, the classic 10fastfingers feel rather than a static passage.
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
  return (
    <button
      type="button"
      className="race-words relative block w-full cursor-text rounded-lg p-5 text-left"
      onClick={() => inputRef.current?.focus()}
    >
      {queue.map((word, i) =>
        i === 0 ? (
          <ActiveWord key="active" word={word} typed={typed} />
        ) : (
          <span key={`${i}-${word}`} className="race-word race-word-pending">
            {word}
          </span>
        ),
      )}
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
