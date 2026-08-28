import { Link } from '@tanstack/react-router'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { LucideIcon } from 'lucide-react'

// A color-tinted grid tile rather than another flat list row — each
// destination gets its own soft hue so the grid reads as distinct
// categories at a glance instead of one uniform stack.
export default function BentoTile({
  to,
  icon: Icon,
  title,
  status,
  ready,
  hue,
  wide,
}: {
  to:
    | '/race/solo'
    | '/race/multiplayer'
    | '/daily-challenge'
    | '/custom-text'
    | '/leaderboards'
    | '/garage-upgrades'
    | '/guide'
    | '/achievements'
    | '/themes'
    | '/friends'
    | '/replays'
  icon: LucideIcon
  title: string
  status: string
  ready: boolean
  hue: string
  wide?: boolean
}) {
  return (
    <Link
      to={to}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      style={{
        background: `color-mix(in oklab, ${hue} 12%, var(--color-card))`,
        borderColor: `color-mix(in oklab, ${hue} 28%, var(--color-border))`,
      }}
      className={cn(
        'tilt-card group flex flex-col items-center justify-center gap-3 rounded-xl border p-5 text-center transition-colors',
        wide ? 'aspect-[1.8/1] sm:aspect-[2.2/1]' : 'aspect-square',
      )}
    >
      <Icon
        className={cn(
          'transition-transform duration-300 group-hover:-translate-y-0.5',
          wide ? 'size-9 sm:size-10' : 'size-7 sm:size-8',
        )}
        style={{ color: hue }}
        strokeWidth={2}
      />
      <div>
        <p
          className={cn(
            'font-bold',
            wide ? 'text-base sm:text-lg' : 'text-sm sm:text-base',
          )}
        >
          {title}
        </p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
          {ready && <span className="size-1.5 rounded-full bg-success" />}
          {status}
        </span>
      </div>
    </Link>
  )
}
