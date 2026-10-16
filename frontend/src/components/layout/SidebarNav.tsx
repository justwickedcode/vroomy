import { Link, useRouterState } from '@tanstack/react-router'
import PixelIcon from '#/components/ui/PixelIcon'
import { cn } from '#/lib/utils'

// Grouped like lichess's sidebar rather than one flat list of links —
// Guide/Stats/Achievements sit together as "about your progress", Garage is
// the one car-cosmetic destination (model, paint, and upgrades all live on
// that single page — no need for separate tabs per section), Compete
// is the social/comparison cluster. No "Play" or "Dashboard" row: the
// wordmark itself is the "/" link, and every mode (Solo/Multiplayer/Friends/
// Daily challenge) is a tile on that same dashboard rather than its own
// sidebar entry — a separate "Play" row here would just be a second link to
// the exact same place as the wordmark.
export const NAV_GROUPS = [
  {
    label: 'Improve',
    items: [
      { to: '/guide', label: 'Type faster', icon: 'keyboard' },
      { to: '/achievements', label: 'Achievements', icon: 'achievements' },
    ],
  },
  {
    label: 'Garage',
    items: [{ to: '/garage', label: 'Garage', icon: 'garage' }],
  },
  {
    label: 'Compete',
    items: [
      { to: '/leaderboards', label: 'Leaderboards', icon: 'leaderboards' },
      { to: '/friends', label: 'Friends', icon: 'friends' },
      { to: '/replays', label: 'Replays', icon: 'replays' },
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

  // Collapsed mode drops the group labels entirely (no room for them), so the extra gap
  // between groups that separates labeled sections in expanded mode has nothing left to
  // separate — it just reads as uneven rhythm between icons. Collapsed uses one uniform gap
  // for every icon instead of a two-tier group/item gap.
  return (
    <nav
      className={cn(
        'flex flex-1 flex-col overflow-y-auto',
        collapsed ? 'gap-1' : 'gap-5',
      )}
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[0.65rem] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
          )}
          <div className={cn('flex flex-col', collapsed ? 'gap-1' : 'gap-0.5')}>
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
                  className="sidebar-link"
                >
                  <span className="relative flex shrink-0 items-center justify-center">
                    <PixelIcon name={item.icon} />
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
