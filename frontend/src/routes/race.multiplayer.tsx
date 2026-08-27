import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/race/multiplayer')({
  component: () => <ComingSoon icon={Users} title="Multiplayer" />,
})
