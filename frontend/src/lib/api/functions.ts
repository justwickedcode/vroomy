import { createServerFn } from '@tanstack/react-start'
import { ApiError, apiFetch } from '#/lib/api/server'
import type {
  ApiCosmetics,
  ApiDailyResult,
  ApiProfile,
  ApiRace,
  ApiRaceInput,
  ApiReplay,
  Friend,
  FriendsResponse,
  Leaderboard,
  LeaderboardQuery,
} from '#/lib/api/types'

// The browser's only way to reach backend/api: each of these runs on the frontend's own server
// (createServerFn strips the handler from the client bundle) and forwards the logged-in
// player's identity from the sealed session cookie — see apiFetch.

// --- Profile & races ---

export const getMyProfileFn = createServerFn({ method: 'GET' }).handler(() =>
  apiFetch<ApiProfile>('/api/users/me', { auth: 'required' }),
)

export const putCosmeticsFn = createServerFn({ method: 'POST' })
  .validator((data: ApiCosmetics) => data)
  .handler(({ data }) =>
    apiFetch<ApiProfile>('/api/users/me/cosmetics', {
      method: 'PUT',
      body: data,
      auth: 'required',
    }),
  )

export const postRaceFn = createServerFn({ method: 'POST' })
  .validator((data: ApiRaceInput) => data)
  .handler(({ data }) =>
    apiFetch<ApiRace>('/api/users/me/races', {
      method: 'POST',
      body: data,
      auth: 'required',
    }),
  )

// A ticket for the race about to start (backend/api/tickets.go): the race can only be saved to
// the account against it.
export const requestRaceTicketFn = createServerFn({ method: 'POST' })
  .validator(
    (data: { mode: 'solo' | 'daily'; passage: string; dailyDate?: string }) =>
      data,
  )
  .handler(({ data }) =>
    apiFetch<{ ticket: string }>('/api/users/me/race-tickets', {
      method: 'POST',
      body: data,
      auth: 'required',
    }),
  )

export const importRacesFn = createServerFn({ method: 'POST' })
  .validator((data: Array<ApiRaceInput>) => data)
  .handler(({ data }) =>
    apiFetch<ApiProfile>('/api/users/me/races/import', {
      method: 'POST',
      body: data,
      auth: 'required',
    }),
  )

export const purchaseFn = createServerFn({ method: 'POST' })
  .validator((itemId: string) => itemId)
  .handler(({ data: itemId }) =>
    apiFetch<ApiProfile>('/api/users/me/purchases', {
      method: 'POST',
      body: { itemId },
      auth: 'required',
    }),
  )

// --- Daily challenge ---

export const getMyDailyFn = createServerFn({ method: 'GET' }).handler(() =>
  apiFetch<Array<ApiDailyResult>>('/api/users/me/daily', { auth: 'required' }),
)

export const importDailyFn = createServerFn({ method: 'POST' })
  .validator((data: Array<ApiDailyResult>) => data)
  .handler(({ data }) =>
    apiFetch<Array<ApiDailyResult>>('/api/users/me/daily/import', {
      method: 'POST',
      body: data,
      auth: 'required',
    }),
  )

// --- Leaderboards ---

export const getLeaderboardFn = createServerFn({ method: 'GET' })
  .validator((data: LeaderboardQuery) => data)
  .handler(({ data }) =>
    apiFetch<Leaderboard>('/api/leaderboards', {
      search: { ...data },
      auth: 'optional',
    }),
  )

// --- Replays ---

// null for a replay that doesn't exist (a stale link), rather than an error page.
export const getReplayFn = createServerFn({ method: 'GET' })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    try {
      return await apiFetch<ApiReplay>(`/api/replays/${id}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  })

// --- Friends ---

export const getFriendsFn = createServerFn({ method: 'GET' }).handler(() =>
  apiFetch<FriendsResponse>('/api/users/me/friends', { auth: 'required' }),
)

export const searchUsersFn = createServerFn({ method: 'GET' })
  .validator((q: string) => q)
  .handler(({ data: q }) =>
    apiFetch<Array<Friend>>('/api/users/search', {
      search: { q },
      auth: 'required',
    }),
  )

export const addFriendFn = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data: userId }) =>
    apiFetch<FriendsResponse>('/api/users/me/friends', {
      method: 'POST',
      body: { userId },
      auth: 'required',
    }),
  )

export const acceptFriendFn = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data: userId }) =>
    apiFetch<FriendsResponse>(
      `/api/users/me/friends/${encodeURIComponent(userId)}/accept`,
      { method: 'POST', auth: 'required' },
    ),
  )

export const removeFriendFn = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data: userId }) =>
    apiFetch<FriendsResponse>(
      `/api/users/me/friends/${encodeURIComponent(userId)}`,
      { method: 'DELETE', auth: 'required' },
    ),
  )
