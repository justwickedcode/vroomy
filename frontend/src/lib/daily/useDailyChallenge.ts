import { useCallback, useEffect, useMemo, useState } from 'react'
import { dateKey, todayKey } from '#/lib/typing/sentences'

const STORAGE_KEY = 'vroomy:daily:v1'
// How many past days the page's history list shows — recent form is what's motivating, a full
// lifetime log isn't, and this keeps the list from growing unbounded for a long-time player.
const HISTORY_LIMIT = 14

export interface DailyResult {
  wpm: number
  accuracy: number
}

export interface DailyHistoryEntry extends DailyResult {
  date: string
}

function readAll(): Record<string, DailyResult> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, DailyResult>)
      : {}
  } catch {
    return {}
  }
}

// Record<string, DailyResult> claims every string key resolves to a DailyResult, which doesn't
// match runtime reality for a plain object used as a lookup map — this narrows the type back to
// honest, so callers actually get type-checked for the missing-entry case instead of eslint
// flagging their `if (result)` guards as pointless.
function getResult(
  all: Record<string, DailyResult>,
  key: string,
): DailyResult | undefined {
  return all[key]
}

function writeAll(all: Record<string, DailyResult>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage unavailable — history just won't persist across reloads.
  }
}

function daysAgoKey(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return dateKey(d)
}

// Consecutive days with a recorded run, counting back from today if today's already done, or
// from yesterday otherwise — so a streak in progress doesn't look broken just because today
// hasn't been played yet (that's exactly the case where showing it is most motivating).
function currentStreak(all: Record<string, DailyResult>): number {
  let streak = 0
  let offset = getResult(all, todayKey()) ? 0 : 1
  while (getResult(all, daysAgoKey(offset))) {
    streak++
    offset++
  }
  return streak
}

export function useDailyChallenge() {
  // Starts as "not yet checked" and reads localStorage after mount, same
  // hydration-safe pattern as useProfile — avoids a server/client mismatch
  // on whatever happened to be in storage.
  const [hydrated, setHydrated] = useState(false)
  const [allResults, setAllResults] = useState<Record<string, DailyResult>>({})

  useEffect(() => {
    setAllResults(readAll())
    setHydrated(true)
  }, [])

  // Only overwrites today's record when the new run actually beats it — "your best attempt
  // each day counts", so retrying after a worse run, in this session or after a refresh, can
  // never clobber a good run already on record.
  const complete = useCallback((wpm: number, accuracy: number) => {
    setAllResults((prev) => {
      const existing = getResult(prev, todayKey())
      if (existing && existing.wpm >= wpm) return prev
      const next = { ...prev, [todayKey()]: { wpm, accuracy } }
      writeAll(next)
      return next
    })
  }, [])

  const result = getResult(allResults, todayKey()) ?? null

  const history = useMemo<Array<DailyHistoryEntry>>(
    () =>
      Object.entries(allResults)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, HISTORY_LIMIT)
        .map(([date, r]) => ({ date, ...r })),
    [allResults],
  )

  const bestWpm = useMemo(
    () => Object.values(allResults).reduce((max, r) => Math.max(max, r.wpm), 0),
    [allResults],
  )

  const streak = useMemo(() => currentStreak(allResults), [allResults])

  return { hydrated, result, complete, history, bestWpm, streak }
}
