import { createFileRoute } from '@tanstack/react-router'
import { Palette } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/themes')({
  component: () => <ComingSoon icon={Palette} title="Themes" />,
})
