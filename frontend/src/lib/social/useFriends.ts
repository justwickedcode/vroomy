import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptFriendFn,
  addFriendFn,
  getFriendsFn,
  removeFriendFn,
  searchUsersFn,
} from '#/lib/api/functions'
import type { FriendsResponse } from '#/lib/api/types'

const friendsQueryKey = ['friends'] as const

// Every friend mutation answers with the full updated list (see backend/api/friends.go's
// writeFriends), so the cache is replaced from the response instead of refetched. Search
// results and the friends leaderboard depend on the same relationships, so they're invalidated.
export function useFriends(enabled: boolean) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: friendsQueryKey,
    queryFn: () => getFriendsFn(),
    enabled,
  })

  function onUpdated(data: FriendsResponse) {
    queryClient.setQueryData(friendsQueryKey, data)
    void queryClient.invalidateQueries({ queryKey: ['userSearch'] })
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
  }

  const add = useMutation({
    mutationFn: (userId: string) => addFriendFn({ data: userId }),
    onSuccess: onUpdated,
  })
  const accept = useMutation({
    mutationFn: (userId: string) => acceptFriendFn({ data: userId }),
    onSuccess: onUpdated,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeFriendFn({ data: userId }),
    onSuccess: onUpdated,
  })

  return { query, add, accept, remove }
}

export function useUserSearch(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['userSearch', trimmed],
    queryFn: () => searchUsersFn({ data: trimmed }),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  })
}
