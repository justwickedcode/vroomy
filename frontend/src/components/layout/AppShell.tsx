import { useEffect, useState } from 'react'
import Sidebar from '#/components/layout/Sidebar'
import MobileTopBar from '#/components/layout/MobileTopBar'
import MobileDrawer from '#/components/layout/MobileDrawer'
import { useSidebarCollapsed } from '#/lib/layout/useSidebarCollapsed'
import type { ReactNode } from 'react'

export default function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { collapsed, toggle } = useSidebarCollapsed()

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [toggle])

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <MobileTopBar onMenuClick={() => setMenuOpen(true)} />
        {children}
      </div>
      {menuOpen && <MobileDrawer onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
