import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dateKey, todayKey } from '#/lib/typing/sentences'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { getMyDailyFn } from '#/lib/api/functions'
import { readLocalDaily, writeLocalDaily } from '#/lib/daily/localDaily'
import type { DailyResult, DailyResults } from '#/lib/daily/localDaily'
import type { ApiDailyResult } from '#/lib/api/types'

export type { DailyResult } from '#/lib/daily/localDaily'

// How many past days the page's history list shows — recent form is what's motivating, a full
// lifetime log isn't, and this keeps the list from growing unbounded for a long-time player.
const HISTORY_LIMIT = 14

export interface DailyHistoryEntry extends DailyResult {
  date: string
}

export const dailyQueryKey = (userId: string | null) =>
  ['daily', userId] as const

// DailyResults claims every string key resolves to a DailyResult, which doesn't match runtime
// reality for a plain object used as a lookup map — this narrows the type back to honest, so
// callers actually get type-checked for the missing-entry case.
function getResult(all: DailyResults, key: string): DailyResult | undefined {
  return all[key]
}

function daysAgoKey(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return dateKey(d)
}

// Consecutive days with a recorded run, counting back from today if today's already done, or
// from yesterday otherwise — so a streak in progress doesn't look broken just because today
// hasn't been played yet (that's exactly the case where showing it is most motivating).
function currentStreak(all: DailyResults): number {
  let streak = 0
  let offset = getResult(all, todayKey()) ? 0 : 1
  while (getResult(all, daysAgoKey(offset))) {
    streak++
    offset++
  }
  return streak
}

function fromApi(results: Array<ApiDailyResult>): DailyResults {
  return Object.fromEntries(
    results.map((r) => [r.date, { wpm: r.wpm, accuracy: r.accuracy }]),
  )
}

// Logged-in players' results come from backend/api (written there by the daily race itself —
// see useProfile's addRace with mode "daily"); guests keep them in localStorage.
export function useDailyChallenge() {
  const { user, loaded: userLoaded } = useCurrentUser()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  // Starts as "not yet checked" and reads localStorage after mount, same
  // hydration-safe pattern as useProfile — avoids a server/client mismatch
  // on whatever happened to be in storage.
  const [localHydrated, setLocalHydrated] = useState(false)
  const [localResults, setLocalResults] = useState<DailyResults>({})

  useEffect(() => {
    setLocalResults(readLocalDaily())
    setLocalHydrated(true)
  }, [])

  const remoteQuery = useQuery({
    queryKey: dailyQueryKey(userId),
    queryFn: () => getMyDailyFn(),
    enabled: userId !== null,
  })
  const allResults = useMemo(
    () =>
      userId !== null && remoteQuery.data
        ? fromApi(remoteQuery.data)
        : localResults,
    [userId, remoteQuery.data, localResults],
  )

  const hydrated =
    userLoaded && localHydrated && (userId === null || !remoteQuery.isPending)

  // Only overwrites today's record when the new run actually beats it — "your best attempt
  // each day counts", so retrying after a worse run, in this session or after a refresh, can
  // never clobber a good run already on record. For a logged-in player this only updates the
  // cached copy so the card reacts instantly; the server applies the same rule when the race
  // itself is saved.
  const complete = useCallback(
    (wpm: number, accuracy: number) => {
      const today = todayKey()
      const key = dailyQueryKey(userId)
      if (userId && queryClient.getQueryData(key)) {
        queryClient.setQueryData<Array<ApiDailyResult>>(key, (prev = []) => {
          const existing = prev.find((r) => r.date === today)
          if (existing && existing.wpm >= wpm) return prev
          return [
            { date: today, wpm, accuracy },
            ...prev.filter((r) => r.date !== today),
          ]
        })
        return
      }
      setLocalResults((prev) => {
        const existing = getResult(prev, today)
        if (existing && existing.wpm >= wpm) return prev
        const next = { ...prev, [today]: { wpm, accuracy } }
        writeLocalDaily(next)
        return next
      })
    },
    [userId, queryClient],
  )

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
