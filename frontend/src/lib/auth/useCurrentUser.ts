import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '#/lib/auth/actions'

export const currentUserQueryKey = ['currentUser'] as const

// Client-side only — a brief "not loaded yet" moment on first paint is the accepted trade-off
// for not threading session data through a root route loader. A shared query rather than
// per-component state, since nearly every page (via useProfile) needs to know who's logged in,
// and they should all ask once.
export function useCurrentUser() {
  const query = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => getCurrentUser(),
    staleTime: Infinity,
    retry: false,
  })
  return { user: query.data ?? null, loaded: !query.isPending }
}
