import { Link, createFileRoute } from '@tanstack/react-router'
import { Flag, Link2, Users } from 'lucide-react'
import { handleTiltLeave, handleTiltMove } from '#/lib/utils'
import { useProfile } from '#/lib/profile/useProfile'

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
  const { hydrated, stats } = useProfile()
  const hasRaced = hydrated && stats.racesPlayed > 0

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap flex h-full flex-col">
        <div className="mb-8 shrink-0">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            How do you want to race?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasRaced
              ? `Your best run is ${stats.bestWpm} wpm — go beat it.`
              : 'Pick a mode below to run your first race.'}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {MODES.map(({ to, icon: Icon, title, detail }, i) => (
            <Link
              key={to}
              to={to}
              onMouseMove={handleTiltMove}
              onMouseLeave={handleTiltLeave}
              className="ignition group relative flex min-h-72 flex-col overflow-hidden p-8 transition-colors hover:bg-accent/40"
            >
              <span className="font-mono text-[0.65rem] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                Bay 0{i + 1}
              </span>
              <Icon
                className="pointer-events-none absolute -right-8 -bottom-10 size-52 text-foreground/[0.05] transition-transform duration-500 ease-out group-hover:scale-110 group-hover:text-foreground/[0.07]"
                strokeWidth={1}
              />
              <div className="relative mt-auto">
                <p className="font-display text-4xl font-extrabold tracking-tight uppercase sm:text-5xl">
                  {title}
                </p>
                <p className="mt-3 max-w-64 text-sm text-muted-foreground">
                  {detail}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
