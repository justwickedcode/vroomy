import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import Logo from '#/components/layout/Logo'
import { SidebarNavList } from '#/components/layout/SidebarNav'

export default function MobileDrawer({ onClose }: { onClose: () => void }) {
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
      </div>
    </div>
  )
}
