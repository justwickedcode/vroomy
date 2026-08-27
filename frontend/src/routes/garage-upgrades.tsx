import { createFileRoute } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/garage-upgrades')({
  component: () => <ComingSoon icon={Wrench} title="Garage upgrades" />,
})
