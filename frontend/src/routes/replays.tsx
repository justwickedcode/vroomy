import { createFileRoute } from '@tanstack/react-router'
import { PlayCircle } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/replays')({
  component: () => <ComingSoon icon={PlayCircle} title="Replays" />,
})
