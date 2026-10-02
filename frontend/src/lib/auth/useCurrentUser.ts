import { useEffect, useState } from 'react'
import { getCurrentUser } from '#/lib/auth/actions'
import type { CurrentUser } from '#/lib/auth/actions'

// Client-side only, same "brief flash while it loads" trade-off already accepted by
// useProfile.ts for the same reason: the alternative (threading session data through a root
// route loader) is real plumbing for a single sidebar block, not worth it yet.
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoaded(true))
  }, [])

  return { user, loaded }
}
