import { createFileRoute } from '@tanstack/react-router'
import { Award } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/achievements')({
  component: () => <ComingSoon icon={Award} title="Achievements" />,
})
