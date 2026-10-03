import { Link } from '@tanstack/react-router'
import { LogIn, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Logo from '#/components/layout/Logo'
import { SidebarNavList } from '#/components/layout/SidebarNav'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { cn } from '#/lib/utils'

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { user, loaded } = useCurrentUser()

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

      {loaded && (
        <div className="mt-4 shrink-0 border-t border-border pt-4">
          {user ? (
            <div
              className={cn(
                'flex items-center gap-2 px-1',
                collapsed && 'justify-center px-0',
              )}
            >
              <Link
                to="/account"
                title="Account"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md transition-colors hover:text-foreground"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="size-7 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {(user.name ?? '?').charAt(0).toUpperCase()}
                  </span>
                )}
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {user.name ?? 'Account'}
                  </span>
                )}
              </Link>
              {!collapsed && (
                <a
                  href="/logout"
                  title="Log out"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </a>
              )}
            </div>
          ) : (
            <a
              href="/login"
              title="Log in"
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <LogIn className="size-4" />
              {!collapsed && <span>Log in</span>}
            </a>
          )}
        </div>
      )}

      <div className="mt-4 shrink-0">
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
