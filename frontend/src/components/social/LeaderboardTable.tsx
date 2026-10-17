import { Link } from '@tanstack/react-router'
import {
  Check,
  Clock,
  Medal,
  PlayCircle,
  UserPlus,
} from '#/components/ui/icons'
import CarIcon from '#/components/typing/CarIcon'
import PlayerAvatar from '#/components/social/PlayerAvatar'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { useFriends } from '#/lib/social/useFriends'
import type { Leaderboard, LeaderboardEntry } from '#/lib/api/types'

const MEDAL_COLORS: Record<number, string | undefined> = {
  1: '#facc15',
  2: '#cbd5e1',
  3: '#c2703d',
}

// Add someone straight from the board, where you see who's racing — logged in only.
function AddFriend({ userId, name }: { userId: string; name: string }) {
  const { user } = useCurrentUser()
  const { query, add } = useFriends(Boolean(user))
  if (!user || !query.data) return null
  const is = (list: Array<{ id: string }>) => list.some((f) => f.id === userId)
  if (is(query.data.friends)) return null
  if (is(query.data.outgoing)) {
    return (
      <Clock
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-label="Friend request sent"
      />
    )
  }
  const sent = add.isSuccess && add.variables === userId
  return (
    <button
      type="button"
      onClick={() => add.mutate(userId)}
      disabled={add.isPending || sent}
      title={`Add ${name} as a friend`}
      aria-label={`Add ${name} as a friend`}
      className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-50"
    >
      {sent ? (
        <Check className="size-3.5" />
      ) : (
        <UserPlus className="size-3.5" />
      )}
    </button>
  )
}

function Row({
  entry,
  compact,
}: {
  entry: LeaderboardEntry
  compact: boolean
}) {
  const medal = MEDAL_COLORS[entry.rank]
  return (
    <div
      className={cn(
        'grid items-center gap-3 rounded-md px-2 py-2 text-sm',
        compact
          ? 'grid-cols-[2rem_1fr_auto_1.5rem]'
          : 'grid-cols-[2.5rem_1fr_auto_auto_1.75rem] sm:grid-cols-[2.5rem_1fr_3.5rem_auto_1.75rem]',
        entry.isMe
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'hover:bg-accent/30',
      )}
    >
      <span className="stat-figure flex items-center gap-1 text-xs text-muted-foreground">
        {medal ? (
          <Medal className="size-4" style={{ color: medal }} />
        ) : (
          `#${entry.rank}`
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <PlayerAvatar name={entry.displayName} avatarUrl={entry.avatarUrl} />
        <span className="truncate font-semibold">
          {entry.displayName || 'Racer'}
        </span>
        {entry.isMe && (
          <Badge
            variant="outline"
            className="shrink-0 px-1.5 py-0 text-[0.6rem]"
          >
            you
          </Badge>
        )}
        {!entry.isMe && !compact && (
          <AddFriend
            userId={entry.userId}
            name={entry.displayName || 'Racer'}
          />
        )}
      </span>
      {!compact && (
        <CarIcon model={entry.carModel} className="hidden w-12 sm:flex" />
      )}
      <span className="stat-figure text-right whitespace-nowrap">
        {entry.wpm} wpm
        {!compact && (
          <span className="ml-3 hidden font-sans text-xs text-muted-foreground tabular-nums sm:inline">
            {entry.accuracy}%
          </span>
        )}
      </span>
      {!compact && (
        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
          {entry.accuracy}%
        </span>
      )}
      {entry.replayId !== null ? (
        <Link
          to="/replays/$replayId"
          params={{ replayId: String(entry.replayId) }}
          title={`Watch ${entry.displayName}'s run`}
          className="flex justify-center text-muted-foreground hover:text-primary"
        >
          <PlayCircle className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

export default function LeaderboardTable({
  board,
  compact = false,
  limit,
  emptyText = 'No races yet',
}: {
  board: Leaderboard
  compact?: boolean
  limit?: number
  emptyText?: string
}) {
  const entries = limit ? board.entries.slice(0, limit) : board.entries
  // The caller's own row, when it's past the cut — either beyond the top 50 (board.me) or just
  // beyond this table's own display limit.
  const me =
    board.me ??
    (limit ? board.entries.slice(limit).find((e) => e.isMe) : undefined)

  if (entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <Row key={entry.userId} entry={entry} compact={compact} />
      ))}
      {me && (
        <>
          <div className="px-2 py-1 text-center text-xs text-muted-foreground">
            ···
          </div>
          <Row entry={me} compact={compact} />
        </>
      )}
    </div>
  )
}
