import { createFileRoute } from '@tanstack/react-router'
import { performLogout } from '#/lib/auth/actions'

export const Route = createFileRoute('/logout')({
  loader: async () => {
    await performLogout()
  },
  component: () => null,
})
