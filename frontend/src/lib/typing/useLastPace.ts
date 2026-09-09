import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vroomy:last-pace:v1'
const DEFAULT_WPM = 60

// SSR-safe: starts at the default and syncs the real last-picked pace from
// localStorage right after mount, same pattern as useProfile/useSidebarCollapsed.
export function useLastPace() {
  const [wpm, setWpmState] = useState(DEFAULT_WPM)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? Number(raw) : NaN
      if (Number.isFinite(parsed)) setWpmState(parsed)
    } catch {
      // localStorage unavailable — falls back to the default every time.
    }
  }, [])

  const setWpm = useCallback((next: number) => {
    setWpmState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore — the choice just won't persist across visits
    }
  }, [])

  return [wpm, setWpm] as const
}
