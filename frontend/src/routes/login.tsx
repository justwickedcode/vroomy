import { createFileRoute } from '@tanstack/react-router'
import { startLogin } from '#/lib/auth/actions'

// No UI ever actually renders here — the loader always throws a redirect (first to the
// identity provider, then eventually to /auth/callback). The component only exists because
// createFileRoute requires one; it's a fallback for the brief instant before that redirect
// takes effect.
export const Route = createFileRoute('/login')({
  loader: async () => {
    await startLogin()
  },
  component: () => null,
})
