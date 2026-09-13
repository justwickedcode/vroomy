import { Link, useRouterState } from '@tanstack/react-router'
import {
  Award,
  CalendarDays,
  Car,
  Flag,
  Keyboard,
  LineChart,
  Palette,
  PlayCircle,
  Trophy,
  UserPlus,
  Wrench,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'

// Grouped like lichess's sidebar rather than one flat list of 13 links —
// Guide/Stats/Achievements sit together as "about your progress", the
// Garage group covers every car-cosmetic destination (including the two
// still-stub ones), Compete is the social/comparison cluster. The wordmark
// itself is the "/" link, so there's no separate "Dashboard" row here.
export const NAV_GROUPS = [
  {
    label: 'Play',
    items: [
      { to: '/play', label: 'Play', icon: Flag, soon: false },
      {
        to: '/daily-challenge',
        label: 'Daily challenge',
        icon: CalendarDays,
        soon: false,
      },
    ],
  },
  {
    label: 'Improve',
    items: [
      { to: '/guide', label: 'Type faster', icon: Keyboard, soon: false },
      { to: '/stats', label: 'Stats', icon: LineChart, soon: false },
      { to: '/achievements', label: 'Achievements', icon: Award, soon: false },
    ],
  },
  {
    label: 'Garage',
    items: [
      { to: '/garage', label: 'Garage', icon: Car, soon: false },
      {
        to: '/garage-upgrades',
        label: 'Upgrades',
        icon: Wrench,
        soon: true,
      },
      { to: '/themes', label: 'Themes', icon: Palette, soon: true },
    ],
  },
  {
    label: 'Compete',
    items: [
      { to: '/leaderboards', label: 'Leaderboards', icon: Trophy, soon: true },
      { to: '/friends', label: 'Friends', icon: UserPlus, soon: true },
      { to: '/replays', label: 'Replays', icon: PlayCircle, soon: true },
    ],
  },
] as const

export function SidebarNavList({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
      {NAV_GROUPS.map((group, groupIndex) => (
        <div
          key={group.label}
          className={cn(
            collapsed && groupIndex > 0 && 'border-t border-border pt-4',
          )}
        >
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[0.65rem] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.to || pathname.startsWith(`${item.to}/`)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  data-active={active}
                  data-collapsed={collapsed}
                  title={item.label}
                  className={cn(
                    'sidebar-link',
                    item.soon && !collapsed && 'opacity-70',
                  )}
                >
                  <span className="relative flex shrink-0 items-center justify-center">
                    <item.icon className="size-4" strokeWidth={2.25} />
                    {item.soon && collapsed && (
                      <span
                        className="absolute -top-1 -right-1 size-1.5 rounded-full bg-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.soon && (
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0 px-1.5 py-0 text-[0.6rem] font-bold"
                        >
                          soon
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
