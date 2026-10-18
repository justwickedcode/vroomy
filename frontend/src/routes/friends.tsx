import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Check,
  Clock,
  Copy,
  Flag,
  LogIn,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from '#/components/ui/icons'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import CarIcon from '#/components/typing/CarIcon'
import PixelSkyline from '#/components/typing/PixelSkyline'
import PlayerAvatar from '#/components/social/PlayerAvatar'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { useFriends, useUserSearch } from '#/lib/social/useFriends'
import type { ReactNode } from 'react'
import type { Friend } from '#/lib/api/types'

// ?add=<player id>: someone's friend link — the page opens with them ready to add.
export const Route = createFileRoute('/friends')({
  validateSearch: (search: Record<string, unknown>): { add?: string } =>
    typeof search.add === 'string' && search.add ? { add: search.add } : {},
  component: FriendsPage,
})

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function FriendRow({
  friend,
  actions,
}: {
  friend: Friend
  actions: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 hover:bg-accent/30">
      <PlayerAvatar
        name={friend.displayName}
        avatarUrl={friend.avatarUrl}
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {friend.displayName || 'Racer'}
        </p>
        <p className="text-xs text-muted-foreground">
          {friend.racesPlayed > 0
            ? `Best ${friend.bestWpm} wpm · ${friend.racesPlayed} race${friend.racesPlayed === 1 ? '' : 's'}`
            : 'No races yet'}
        </p>
      </div>
      <CarIcon
        model={friend.carModel}
        underglow={friend.underglow}
        underglowColor={friend.underglowColor}
        className="hidden w-14 sm:flex"
      />
      <div className="flex shrink-0 gap-1.5">{actions}</div>
    </div>
  )
}

// One connected panel, like the dashboard: each section is a cell, neighbours share a line.
const PANEL =
  'rise-in px-corners flex flex-1 flex-col gap-[2px] border-2 border-border bg-border'
const CELL = 'bg-card'

function Section({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: number
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(CELL, 'p-5', className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="kicker">{title}</p>
        {count !== undefined && count > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function FriendsPage() {
  const { user, loaded } = useCurrentUser()
  const { query, add, accept, remove } = useFriends(Boolean(user))
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)
  const results = useUserSearch(user ? debouncedSearch : '')
  // Arrived through someone's friend link: them, ready to add (unless it's our own link).
  const { add: invitedId } = Route.useSearch()
  const invite = useUserSearch(
    user && invitedId && invitedId !== user.id ? invitedId : '',
  )
  const invited = invite.data?.find((person) => person.id === invitedId)
  const [linkCopied, setLinkCopied] = useState(false)

  async function copyFriendLink() {
    if (!user) return
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/friends?add=${encodeURIComponent(user.id)}`,
      )
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      // No clipboard access: nothing to copy to.
    }
  }

  const pendingId =
    (add.isPending && add.variables) ||
    (accept.isPending && accept.variables) ||
    (remove.isPending && remove.variables) ||
    null
  const busy = (id: string) => pendingId === id

  function searchAction(person: Friend) {
    switch (person.status) {
      case 'friends':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <Check className="size-3.5" /> Friends
          </span>
        )
      case 'outgoing':
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Requested
          </span>
        )
      case 'incoming':
        return (
          <Button
            size="sm"
            onClick={() => accept.mutate(person.id)}
            disabled={busy(person.id)}
          >
            <Check /> Accept
          </Button>
        )
      default:
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => add.mutate(person.id)}
            disabled={busy(person.id)}
          >
            <UserPlus /> Add
          </Button>
        )
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {!loaded ? (
          <div className={PANEL}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(CELL, 'h-16 animate-pulse last:flex-1')}
              />
            ))}
          </div>
        ) : !user ? (
          <div className={PANEL}>
            <PixelSkyline className="h-40 sm:h-56" />
            <div
              className={cn(
                CELL,
                'flex flex-1 flex-col items-center justify-center gap-4 py-12',
              )}
            >
              <Users className="size-12" />
              <p className="font-display text-2xl uppercase">Friends</p>
              <Button asChild>
                <a href="/login">
                  <LogIn className="size-4" />
                  Log in
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className={PANEL}>
            <div className={cn(CELL, 'flex flex-col gap-3 p-4 sm:flex-row')}>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find racers by name or email"
                  className="h-10 pl-9"
                  aria-label="Search racers"
                />
              </div>
              <Button
                variant="outline"
                className="h-10"
                onClick={copyFriendLink}
                title="Anyone who opens it can add you in one click"
              >
                {linkCopied ? <Check className="text-success" /> : <Copy />}
                {linkCopied ? 'Link copied' : 'Copy my friend link'}
              </Button>
              <Button asChild variant="outline" className="h-10">
                <Link to="/race/friends">
                  <Flag /> Race friends
                </Link>
              </Button>
            </div>

            {invited && (
              <Section title="Friend link">
                <FriendRow friend={invited} actions={searchAction(invited)} />
              </Section>
            )}

            {debouncedSearch.trim().length >= 2 && (
              <Section title="Search results">
                {results.isPending ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Searching…
                  </p>
                ) : results.data && results.data.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {results.data.map((person) => (
                      <FriendRow
                        key={person.id}
                        friend={person}
                        actions={searchAction(person)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">
                    No racers match “{debouncedSearch.trim()}”. Or send them
                    your friend link.
                  </p>
                )}
              </Section>
            )}

            {query.data && query.data.incoming.length > 0 && (
              <Section title="Requests" count={query.data.incoming.length}>
                <div className="flex flex-col gap-0.5">
                  {query.data.incoming.map((friend) => (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      actions={
                        <>
                          <Button
                            size="sm"
                            onClick={() => accept.mutate(friend.id)}
                            disabled={busy(friend.id)}
                          >
                            <Check /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove.mutate(friend.id)}
                            disabled={busy(friend.id)}
                            aria-label={`Decline ${friend.displayName}`}
                          >
                            <X />
                          </Button>
                        </>
                      }
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section
              title="Your friends"
              count={query.data?.friends.length}
              className="flex-1"
            >
              {query.isError ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Couldn't load your friends. Try again in a moment.
                </p>
              ) : !query.data ? (
                <div className="h-12 animate-pulse bg-secondary/40" />
              ) : query.data.friends.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No friends yet
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {query.data.friends.map((friend) => (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove.mutate(friend.id)}
                          disabled={busy(friend.id)}
                          aria-label={`Remove ${friend.displayName}`}
                          title="Remove friend"
                        >
                          <UserMinus />
                        </Button>
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            {query.data && query.data.outgoing.length > 0 && (
              <Section title="Sent requests" count={query.data.outgoing.length}>
                <div className="flex flex-col gap-0.5">
                  {query.data.outgoing.map((friend) => (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove.mutate(friend.id)}
                          disabled={busy(friend.id)}
                        >
                          Cancel
                        </Button>
                      }
                    />
                  ))}
                </div>
              </Section>
            )}

            {(add.isError || accept.isError || remove.isError) && (
              <p className={cn(CELL, 'p-4 text-sm text-destructive')}>
                That didn't go through. Try again in a moment.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
