import { createFileRoute } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/custom-text')({
  component: () => <ComingSoon icon={FileText} title="Custom text" />,
})
