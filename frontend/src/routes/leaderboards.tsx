import { Link, createFileRoute } from '@tanstack/react-router'
import { LogIn } from '#/components/ui/icons'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import LeaderboardTable from '#/components/social/LeaderboardTable'
import { useLeaderboard } from '#/lib/social/useLeaderboard'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { todayKey } from '#/lib/typing/sentences'
import { cn } from '#/lib/utils'
import type {
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

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <Card className="rise-in overflow-hidden">
          <CardHeader className="flex-col items-stretch gap-3 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
          </CardHeader>
          <div className="glass-divider" />
          <CardContent className="pt-4 pb-6">
            {leaderboard.isError ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Couldn't load the leaderboard. Try again in a moment.
              </p>
            ) : !leaderboard.data ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-md bg-secondary/40"
                  />
                ))}
              </div>
            ) : (
              <LeaderboardTable
                board={leaderboard.data}
                emptyText={
                  scope === 'friends'
                    ? 'No races from you or your friends in this window yet.'
                    : 'Nobody on the board yet — be the first.'
                }
              />
            )}
          </CardContent>
        </Card>

        {loaded && !user && (
          <Card className="rise-in mt-4 overflow-hidden">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
              <p className="flex-1 text-sm text-muted-foreground">
                Races only count toward the leaderboard when you're logged in.
                Anything you've already played as a guest comes with you.
              </p>
              <Button asChild size="sm">
                <a href="/login">
                  <LogIn />
                  Log in
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {user && scope === 'friends' && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Racing alone?{' '}
            <Link to="/friends" className="font-semibold text-primary">
              Add some friends
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  )
}
