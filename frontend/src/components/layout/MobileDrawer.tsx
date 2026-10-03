import { Link } from '@tanstack/react-router'
import { LogIn, LogOut, X } from 'lucide-react'
import Logo from '#/components/layout/Logo'
import { SidebarNavList } from '#/components/layout/SidebarNav'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'

export default function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { user, loaded } = useCurrentUser()

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="rise-in relative flex h-full w-72 max-w-[80vw] flex-col bg-background px-4 py-5 shadow-2xl">
        <div className="mb-6 flex shrink-0 items-center justify-between px-1">
          <Link to="/" onClick={onClose} className="flex items-center gap-2">
            <Logo />
            <span className="text-base font-bold tracking-tight">Vroomy</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <SidebarNavList onNavigate={onClose} />
        {loaded && (
          <div className="mt-4 shrink-0 border-t border-border pt-4">
            {user ? (
              <div className="flex items-center gap-2 px-1">
                <Link
                  to="/account"
                  onClick={onClose}
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
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {user.name ?? 'Account'}
                  </span>
                </Link>
                <a
                  href="/logout"
                  title="Log out"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </a>
              </div>
            ) : (
              <a
                href="/login"
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogIn className="size-4" />
                <span>Log in</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
