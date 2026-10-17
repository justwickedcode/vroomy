import { createFileRoute, redirect } from '@tanstack/react-router'

// The stats page now lives on the dashboard (the stats strip, WPM trend and recent races);
// old links and bookmarks land there instead.
export const Route = createFileRoute('/stats')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
