import { useEffect, useState } from 'react'

// Matches the same 'lg' breakpoint the app's own nav already treats as its mobile/desktop
// boundary (see MobileTopBar's `lg:hidden` — the sidebar nav only appears at 'lg' and up).
const DESKTOP_QUERY = '(min-width: 1024px)'

// Returns null until resolved on the client (SSR has no viewport to check, and nothing should
// assume an answer before then — callers that need to avoid mounting something on mobile, like
// a WebSocket connection, should treat null as "not yet known" rather than defaulting either
// way), then the real answer from matchMedia, kept live across resizes/rotations.
export function useIsDesktopViewport(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    setIsDesktop(query.matches)

    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
