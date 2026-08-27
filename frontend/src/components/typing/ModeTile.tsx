import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LucideIcon } from 'lucide-react'

// A timing-sheet row, not a feature card — no icon-in-a-colored-square, no
// pill badge. Rows are told apart by spacing and a rounded hover state
// rather than hairline dividers, closer to a race program than an app
// onboarding list.
export default function ModeTile({
  to,
  index,
  title,
  status,
  ready,
  icon: Icon,
}: {
  to:
    | '/race/solo'
    | '/race/multiplayer'
    | '/daily-challenge'
    | '/custom-text'
    | '/leaderboards'
    | '/garage-upgrades'
    | '/guide'
  index: string
  title: string
  status: string
  ready: boolean
  icon: LucideIcon
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-lg px-4 py-5 transition-colors hover:bg-white/[0.05]"
    >
      <span className="font-mono text-xs text-muted-foreground">{index}</span>
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
      <span className="flex-1 font-mono text-sm font-bold tracking-wide uppercase">
        {title}
      </span>
      <span
        className={cn(
          'font-mono text-xs font-bold tracking-wider uppercase',
          ready ? 'text-success' : 'text-muted-foreground',
        )}
      >
        {status}
      </span>
      <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
    </Link>
  )
}
