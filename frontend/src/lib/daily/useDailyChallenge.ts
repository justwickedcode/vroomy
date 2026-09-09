import { useCallback, useEffect, useState } from 'react'
import { todayKey } from '#/lib/typing/sentences'

const STORAGE_KEY = 'vroomy:daily:v1'

export interface DailyResult {
  wpm: number
  accuracy: number
}

function readResult(key: string): DailyResult | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, DailyResult>
    return all[key] ?? null
  } catch {
    return null
  }
}

function writeResult(key: string, result: DailyResult) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, DailyResult>) : {}
    all[key] = result
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage unavailable — the completed banner just won't persist.
  }
}

export function useDailyChallenge() {
  // Starts as "not yet checked" and reads localStorage after mount, same
  // hydration-safe pattern as useProfile — avoids a server/client mismatch
  // on whatever happened to be in storage.
  const [hydrated, setHydrated] = useState(false)
  const [result, setResult] = useState<DailyResult | null>(null)

  useEffect(() => {
    setResult(readResult(todayKey()))
    setHydrated(true)
  }, [])

  const complete = useCallback((wpm: number, accuracy: number) => {
    const record = { wpm, accuracy }
    writeResult(todayKey(), record)
    setResult(record)
  }, [])

  return { hydrated, result, complete }
}
