import { Link } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen, Trophy } from 'lucide-react'
import Logo from '#/components/layout/Logo'
import { SidebarNavList } from '#/components/layout/SidebarNav'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { hydrated, stats } = useProfile()

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border px-4 py-5 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <Link
        to="/"
        className={cn(
          'mb-6 flex shrink-0 items-center gap-2 px-1',
          collapsed && 'justify-center px-0',
        )}
      >
        <Logo />
        {!collapsed && (
          <span className="text-base font-bold tracking-tight">Vroomy</span>
        )}
      </Link>

      <SidebarNavList collapsed={collapsed} />

      <div className="mt-4 shrink-0 border-t border-border pt-4">
        {hydrated && stats.racesPlayed > 0 && (
          <div
            className={cn(
              'mb-3 flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5',
              collapsed && 'flex-col gap-1 px-1',
            )}
          >
            <Trophy
              className="size-4 shrink-0 text-primary"
              strokeWidth={2.5}
            />
            {collapsed ? (
              <span className="stat-figure text-xs text-primary">
                {stats.bestWpm}
              </span>
            ) : (
              <div className="flex flex-1 items-baseline justify-between gap-2">
                <span className="text-[0.65rem] font-bold tracking-wide text-muted-foreground uppercase">
                  Best wpm
                </span>
                <span className="stat-figure text-xl text-primary">
                  {stats.bestWpm}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
