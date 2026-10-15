import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getLeaderboardFn } from '#/lib/api/functions'
import type { LeaderboardQuery } from '#/lib/api/types'

// Every leaderboard query shares the ['leaderboard'] prefix so a finished race can invalidate
// them all at once (see useProfile's addRace).
export function useLeaderboard(query: LeaderboardQuery, enabled = true) {
  return useQuery({
    queryKey: ['leaderboard', query],
    queryFn: () => getLeaderboardFn({ data: query }),
    enabled,
    staleTime: 30_000,
    // Switching tabs/periods keeps the old table on screen until the new one arrives, instead of
    // flashing an empty state in between.
    placeholderData: keepPreviousData,
  })
}
