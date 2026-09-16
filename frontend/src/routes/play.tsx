import { Link, createFileRoute } from '@tanstack/react-router'
import { Flag, Link2, Users } from 'lucide-react'
import { handleTiltLeave, handleTiltMove } from '#/lib/utils'

export const Route = createFileRoute('/play')({ component: PlayPage })

const MODES = [
  {
    to: '/race/solo',
    icon: Flag,
    title: 'Solo',
    detail: 'Race the clock against AI bots at your speed.',
  },
  {
    to: '/race/multiplayer',
    icon: Users,
    title: 'Multiplayer',
    detail: 'Get matched against real players.',
  },
  {
    to: '/race/friends',
    icon: Link2,
    title: 'With friends',
    detail: 'Create a room and send the link.',
  },
] as const

function PlayPage() {
  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            How do you want to race?
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODES.map(({ to, icon: Icon, title, detail }) => (
            <Link
              key={to}
              to={to}
              onMouseMove={handleTiltMove}
              onMouseLeave={handleTiltLeave}
              className="tilt-card glass-chip flex flex-col gap-3 rounded-xl p-5 transition-colors hover:border-primary/50"
            >
              <Icon className="size-5 text-primary" strokeWidth={2.25} />
              <div>
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
