import { Link } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Logo from '#/components/layout/Logo'
import { SidebarNavList } from '#/components/layout/SidebarNav'
import { cn } from '#/lib/utils'

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col overflow-y-auto border-r border-border px-4 py-6 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <Link
        to="/"
        className={cn(
          'mb-8 flex shrink-0 items-center gap-2.5 px-1',
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
