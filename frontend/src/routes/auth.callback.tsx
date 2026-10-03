import { createFileRoute } from '@tanstack/react-router'
import { completeLogin } from '#/lib/auth/actions'

export const Route = createFileRoute('/auth/callback')({
  loader: async () => {
    await completeLogin()
  },
  component: () => null,
})
