import { useEffect } from 'react'
import type { RefObject } from 'react'

// While a race is on, the hidden typing input owns the keyboard: wherever you click on the page
// (the track, the console, empty space, even a button — whose click still goes through), focus
// snaps straight back to it, and if something else did end up focused, the next keystroke is
// steered into the race instead of being lost. Other text fields (a search box, say) are left
// alone.
function isOtherTextField(el: Element | null, input: HTMLInputElement | null) {
  if (!el || el === input) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement)
    return !['button', 'checkbox', 'radio', 'range'].includes(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

export function useKeepTypingFocus(
  inputRef: RefObject<HTMLInputElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const refocus = () => {
      const input = inputRef.current
      if (!input || input.disabled) return
      if (isOtherTextField(document.activeElement, input)) return
      if (document.activeElement !== input) input.focus({ preventScroll: true })
    }
    // After the click has done its own thing (a button's handler, a link...).
    const onPointerUp = () => setTimeout(refocus, 0)
    // Focusing during keydown redirects this very keystroke into the input.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      refocus()
    }
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('focus', refocus)
    refocus()
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('focus', refocus)
    }
  }, [inputRef, active])
}
