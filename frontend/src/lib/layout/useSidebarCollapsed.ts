import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vroomy:sidebar-collapsed:v1'

// SSR-safe: starts expanded (the deterministic default) and syncs the real
// preference from localStorage right after mount, same pattern as
// useProfile/useDailyChallenge.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // localStorage unavailable — just falls back to always-expanded.
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
