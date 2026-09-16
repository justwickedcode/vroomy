import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vroomy:sidebar-collapsed:v1'

// SSR-safe: starts collapsed to an icon-only rail (the deterministic default)
// and syncs the real preference from localStorage right after mount, same
// pattern as useProfile/useDailyChallenge — an explicit prior choice, in
// either direction, always wins over the default.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored !== null) setCollapsed(stored === '1')
    } catch {
      // localStorage unavailable — just falls back to always-collapsed.
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore — collapse state just won't persist across reloads
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
