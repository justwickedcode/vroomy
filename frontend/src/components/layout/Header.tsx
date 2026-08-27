import { Link, useRouterState } from '@tanstack/react-router'
import { useProfile } from '#/lib/profile/useProfile'

const NAV_LINKS = [
  { to: '/', label: 'Race' },
  { to: '/garage', label: 'Garage' },
  { to: '/stats', label: 'Stats' },
] as const

export default function Header() {
  const { hydrated, stats } = useProfile()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <header className="site-header">
      <div className="page-wrap flex h-14 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rotate-45 bg-primary"
          />
          <span className="text-base font-extrabold tracking-tight">
            VROOMY
          </span>
        </Link>

        <nav className="flex items-center gap-5 sm:gap-7">
          {NAV_LINKS.map(({ to, label }) => {
            const active =
              to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link key={to} to={to} className="nav-link" data-active={active}>
                {label.toUpperCase()}
              </Link>
            )
          })}
        </nav>

        <div className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
          {hydrated && stats.racesPlayed > 0 && (
            <span className="text-primary">▲ {stats.bestWpm}</span>
          )}
        </div>
      </div>
    </header>
  )
}
