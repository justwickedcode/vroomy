import { Link, createFileRoute } from '@tanstack/react-router'
import { LogIn, PlayCircle } from '#/components/ui/icons'
import CarIcon from '#/components/typing/CarIcon'
import PixelSkyline from '#/components/typing/PixelSkyline'
import { Button } from '#/components/ui/button'
import LeaderboardTable from '#/components/social/LeaderboardTable'
import { useLeaderboard } from '#/lib/social/useLeaderboard'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { todayKey } from '#/lib/typing/sentences'
import { cn } from '#/lib/utils'
import type {
  LeaderboardEntry,
  LeaderboardBoard,
  LeaderboardPeriod,
  LeaderboardScope,
} from '#/lib/api/types'

interface LeaderboardSearch {
  board?: LeaderboardBoard
  period?: LeaderboardPeriod
  scope?: LeaderboardScope
}

function pick<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): T | undefined {
  return allowed.find((a) => a === value)
}

// Tabs live in the URL so a specific board (e.g. "friends, this week") can be linked to and
// survives a reload.
export const Route = createFileRoute('/leaderboards')({
  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => ({
    board: pick(search.board, ['speed', 'daily'] as const),
    period: pick(search.period, ['day', 'week', 'all'] as const),
    scope: pick(search.scope, ['global', 'friends'] as const),
  }),
  component: LeaderboardsPage,
})

const BOARDS: Array<{ id: LeaderboardBoard; label: string }> = [
  { id: 'speed', label: 'Top speed' },
  { id: 'daily', label: 'Daily challenge' },
]

const PERIODS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: 'day', label: '24 hours' },
  { id: 'week', label: '7 days' },
  { id: 'all', label: 'All time' },
]

const SCOPES: Array<{ id: LeaderboardScope; label: string }> = [
  { id: 'global', label: 'Everyone' },
  { id: 'friends', label: 'Friends' },
]

function Segmented<T extends string>({
  options,
  value,
  onSelect,
  disabled,
}: {
  options: Array<{ id: T; label: string }>
  value: T
  onSelect: (id: T) => void
  disabled?: (id: T) => boolean
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/30 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          disabled={disabled?.(option.id)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === option.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function LeaderboardsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { user, loaded } = useCurrentUser()

  const board = search.board ?? 'speed'
  const period = search.period ?? 'week'
  // A logged-out visitor can't have friends; fall back rather than showing an error.
  const scope = user ? (search.scope ?? 'global') : 'global'

  const query =
    board === 'daily'
      ? { board, scope, date: todayKey() }
      : { board, scope, period }
  const leaderboard = useLeaderboard(query, loaded)

  function update(patch: LeaderboardSearch) {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  }

  const entries = leaderboard.data?.entries ?? []

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {/* One connected panel: controls, the podium, then everyone else. */}
        <div className="rise-in px-corners grid flex-1 grid-rows-[auto_1fr_auto] gap-[2px] border-2 border-border bg-border">
          <div className="flex flex-col gap-3 bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Segmented
              options={BOARDS}
              value={board}
              onSelect={(id) => update({ board: id })}
            />
            <div className="flex flex-wrap gap-2">
              {board === 'speed' && (
                <Segmented
                  options={PERIODS}
                  value={period}
                  onSelect={(id) => update({ period: id })}
                />
              )}
              <Segmented
                options={SCOPES}
                value={scope}
                onSelect={(id) => update({ scope: id })}
                disabled={(id) => id === 'friends' && !user}
              />
            </div>
          </div>

          <div className="relative flex min-h-80 flex-col justify-end overflow-hidden bg-card">
            {/* The podium stands on the same synthwave street as the dashboard's title track. */}
            <PixelSkyline className="absolute inset-0 h-full sm:h-full" />
            {leaderboard.isError ? (
              <p className="relative py-10 text-center text-sm font-semibold">
                Couldn't load the leaderboard. Try again in a moment.
              </p>
            ) : !leaderboard.data ? (
              <div className="relative h-64 animate-pulse bg-black/20" />
            ) : entries.length === 0 ? (
              <p className="relative py-10 text-center text-sm font-semibold">
                No races yet
              </p>
            ) : (
              <Podium entries={entries.slice(0, 3)} />
            )}
          </div>

          <div className="flex flex-col bg-card empty:hidden">
            {leaderboard.data && entries.length > 3 && (
              <div className="p-4">
                <LeaderboardTable
                  board={{ entries: entries.slice(3), me: leaderboard.data.me }}
                />
              </div>
            )}
            {leaderboard.data && entries.length <= 3 && leaderboard.data.me && (
              <div className="p-4">
                <LeaderboardTable
                  board={{ entries: [], me: leaderboard.data.me }}
                  emptyText=""
                />
              </div>
            )}
            {loaded && !user && (
              <div className="flex items-center justify-between gap-3 border-t-2 border-border p-4 first:border-t-0">
                <p className="text-sm text-muted-foreground">
                  Log in to get ranked.
                </p>
                <Button asChild size="sm">
                  <a href="/login">
                    <LogIn />
                    Log in
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

// The top three as a game-style podium: each racer's car stands on a pixel block — first in the
// middle and tallest, with gold, silver and bronze tops.
const PODIUM_ORDER = [1, 0, 2]
const PODIUM_STYLE = [
  { height: 'h-36', color: '#facc15' },
  { height: 'h-24', color: '#cbd5e1' },
  { height: 'h-16', color: '#c2703d' },
]

function Podium({ entries }: { entries: Array<LeaderboardEntry> }) {
  return (
    <div className="relative flex items-end justify-center gap-3 px-4 pt-8 [text-shadow:2px_2px_0_#1a0b2e] sm:gap-6">
      {PODIUM_ORDER.map((slot) => {
        const entry = entries[slot] as LeaderboardEntry | undefined
        const style = PODIUM_STYLE[slot]
        return (
          <div
            key={slot}
            className="flex w-28 flex-col items-center gap-2 sm:w-48"
          >
            {entry ? (
              <>
                <CarIcon
                  model={entry.carModel}
                  className={cn('w-20 sm:w-32', slot === 0 && 'race-car-bob')}
                />
                <div className="text-center">
                  <p className="flex items-center justify-center gap-1.5 text-sm font-bold">
                    <span className="truncate">
                      {entry.displayName || 'Racer'}
                    </span>
                    {entry.isMe && (
                      <span className="text-xs text-primary">(you)</span>
                    )}
                  </p>
                  <p className="font-display text-2xl leading-none">
                    {entry.wpm}
                    <span className="ml-1 text-sm text-muted-foreground">
                      wpm
                    </span>
                  </p>
                </div>
                {entry.replayId !== null && (
                  <Link
                    to="/replays/$replayId"
                    params={{ replayId: String(entry.replayId) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <PlayCircle className="size-3.5" />
                    Replay
                  </Link>
                )}
              </>
            ) : (
              <div className="h-24" />
            )}
            <div
              className={cn(
                'flex w-full items-start justify-center pt-3',
                style.height,
              )}
              // A solid pixel block: bright top edge, the medal colour darkening downward, a lit left side.
              style={{
                background: `linear-gradient(to bottom, ${style.color} 0 6px, color-mix(in oklab, ${style.color} 55%, #000) 6px 50%, color-mix(in oklab, ${style.color} 40%, #000) 50%)`,
                boxShadow: `inset 6px 0 0 color-mix(in oklab, ${style.color} 75%, #fff), inset -6px 0 0 color-mix(in oklab, ${style.color} 30%, #000)`,
              }}
            >
              <span className="font-display text-4xl text-white [text-shadow:3px_3px_0_rgb(0_0_0/0.45)]">
                {slot + 1}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
