import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'
import ComingSoon from '#/components/layout/ComingSoon'

export const Route = createFileRoute('/daily-challenge')({
  component: () => <ComingSoon icon={CalendarDays} title="Daily challenge" />,
})
