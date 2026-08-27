import { createFileRoute } from '@tanstack/react-router'
import {
  Bot,
  BookOpen,
  CalendarDays,
  FileText,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import ModeTile from '#/components/typing/ModeTile'

export const Route = createFileRoute('/')({ component: App })

const TILES = [
  {
    to: '/race/solo',
    title: 'Solo vs AI',
    status: 'ready',
    ready: true,
    icon: Bot,
  },
  {
    to: '/race/multiplayer',
    title: 'Multiplayer',
    status: 'soon',
    ready: false,
    icon: Users,
  },
  {
    to: '/daily-challenge',
    title: 'Daily challenge',
    status: 'soon',
    ready: false,
    icon: CalendarDays,
  },
  {
    to: '/custom-text',
    title: 'Custom text',
    status: 'soon',
    ready: false,
    icon: FileText,
  },
  {
    to: '/leaderboards',
    title: 'Leaderboards',
    status: 'soon',
    ready: false,
    icon: Trophy,
  },
  {
    to: '/garage-upgrades',
    title: 'Garage upgrades',
    status: 'soon',
    ready: false,
    icon: Wrench,
  },
  {
    to: '/guide',
    title: 'Type faster',
    status: 'guide',
    ready: true,
    icon: BookOpen,
  },
] as const

function App() {
  return (
    <main className="px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <h1 className="rise-in mb-8 text-4xl font-extrabold tracking-tight sm:text-6xl">
          Type fast. Win the race.
        </h1>
        <Card className="rise-in overflow-hidden">
          <CardContent className="flex flex-col gap-1 p-3">
            {TILES.map(({ to, title, status, ready, icon }, i) => (
              <ModeTile
                key={to}
                to={to}
                index={String(i + 1).padStart(2, '0')}
                title={title}
                status={status}
                ready={ready}
                icon={icon}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
