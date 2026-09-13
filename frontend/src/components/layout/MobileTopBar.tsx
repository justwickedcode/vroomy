import { Link } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import Logo from '#/components/layout/Logo'

export default function MobileTopBar({
  onMenuClick,
}: {
  onMenuClick: () => void
}) {
  return (
    <header className="site-header flex h-14 shrink-0 items-center justify-between px-4 lg:hidden">
      <Link to="/" className="flex items-center gap-2">
        <Logo />
        <span className="text-base font-bold tracking-tight">Vroomy</span>
      </Link>
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Menu className="size-5" />
      </button>
    </header>
  )
}
