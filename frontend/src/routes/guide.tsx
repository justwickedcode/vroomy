import { createFileRoute, redirect } from '@tanstack/react-router'

// The typing drill is now Practice; old links and bookmarks land there instead.
export const Route = createFileRoute('/guide')({
  beforeLoad: () => {
    throw redirect({ to: '/practice' })
  },
})
