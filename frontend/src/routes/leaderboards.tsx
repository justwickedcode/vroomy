import { createFileRoute } from '@tanstack/react-router'
import { Trophy } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/leaderboards')({
  component: () => <ComingSoon icon={Trophy} title="Leaderboards" />,
})
