import { createFileRoute } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/friends')({
  component: () => <ComingSoon icon={UserPlus} title="Friends" />,
})
