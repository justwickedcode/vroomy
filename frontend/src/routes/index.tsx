import { createFileRoute } from '@tanstack/react-router'
import {
  Award,
  Bot,
  BookOpen,
  CalendarDays,
  FileText,
  Palette,
  PlayCircle,
  Trophy,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react'
import BentoTile from '#/components/typing/BentoTile'

export const Route = createFileRoute('/')({ component: App })

const FEATURED = [
  {
    to: '/race/solo',
    title: 'Solo vs AI',
    status: 'ready',
    ready: true,
    icon: Bot,
    hue: 'var(--color-primary)',
  },
  {
    to: '/race/multiplayer',
    title: 'Multiplayer',
    status: 'soon',
    ready: false,
    icon: Users,
    hue: '#a78bfa',
  },
] as const

const MORE = [
  {
    to: '/daily-challenge',
    title: 'Daily challenge',
    status: 'soon',
    ready: false,
    icon: CalendarDays,
    hue: '#fbbf24',
  },
  {
    to: '/custom-text',
    title: 'Custom text',
    status: 'soon',
    ready: false,
    icon: FileText,
    hue: '#34d399',
  },
  {
    to: '/leaderboards',
    title: 'Leaderboards',
    status: 'soon',
    ready: false,
    icon: Trophy,
    hue: '#fb7185',
  },
  {
    to: '/garage-upgrades',
    title: 'Garage upgrades',
    status: 'soon',
    ready: false,
    icon: Wrench,
    hue: '#2dd4bf',
  },
  {
    to: '/guide',
    title: 'Type faster',
    status: 'guide',
    ready: true,
    icon: BookOpen,
    hue: '#818cf8',
  },
  {
    to: '/achievements',
    title: 'Achievements',
    status: 'soon',
    ready: false,
    icon: Award,
    hue: '#a3e635',
  },
  {
    to: '/themes',
    title: 'Themes',
    status: 'soon',
    ready: false,
    icon: Palette,
    hue: '#f472b6',
  },
  {
    to: '/friends',
    title: 'Friends',
    status: 'soon',
    ready: false,
    icon: UserPlus,
    hue: '#22d3ee',
  },
  {
    to: '/replays',
    title: 'Replays',
    status: 'soon',
    ready: false,
    icon: PlayCircle,
    hue: '#e879f9',
  },
] as const

function App() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURED.map((tile) => (
            <BentoTile key={tile.to} {...tile} wide />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {MORE.map((tile) => (
            <BentoTile key={tile.to} {...tile} />
          ))}
        </div>
      </div>
    </main>
  )
}
