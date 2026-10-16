import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Check,
  Clock,
  Flag,
  LogIn,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from '#/components/ui/icons'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import CarIcon from '#/components/typing/CarIcon'
import PlayerAvatar from '#/components/social/PlayerAvatar'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import { useFriends, useUserSearch } from '#/lib/social/useFriends'
import type { ReactNode } from 'react'
import type { Friend } from '#/lib/api/types'

export const Route = createFileRoute('/friends')({ component: FriendsPage })

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
    <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/30">
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
      <CarIcon model={friend.carModel} className="hidden w-14 sm:flex" />
      <div className="flex shrink-0 gap-1.5">{actions}</div>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <>
      <div className="glass-divider" />
      <CardHeader className="py-5">
        <p className="kicker">
          {title}
          {count !== undefined && count > 0 ? ` · ${count}` : ''}
        </p>
      </CardHeader>
      <CardContent className="pt-0 pb-6">{children}</CardContent>
    </>
  )
}

function FriendsPage() {
  const { user, loaded } = useCurrentUser()
  const { query, add, accept, remove } = useFriends(Boolean(user))
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)
  const results = useUserSearch(user ? debouncedSearch : '')

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
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        {!loaded ? (
          <Card className="rise-in overflow-hidden">
            <CardContent className="flex flex-col gap-2 py-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-md bg-secondary/40"
                />
              ))}
            </CardContent>
          </Card>
        ) : !user ? (
          <Card className="rise-in overflow-hidden text-center">
            <CardHeader className="items-center py-10">
              <Users className="mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">Log in to add friends</p>
            </CardHeader>
            <CardContent className="pb-10">
              <Button asChild>
                <a href="/login">
                  <LogIn className="size-4" />
                  Log in
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rise-in overflow-hidden">
            <CardContent className="flex flex-col gap-3 pt-6 pb-6 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find racers by name"
                  className="h-10 pl-9"
                  aria-label="Search racers"
                />
              </div>
              <Button asChild variant="outline" className="h-10">
                <Link to="/race/friends">
                  <Flag /> Race friends
                </Link>
              </Button>
            </CardContent>

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
                    No racers match “{debouncedSearch.trim()}”.
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

            <Section title="Your friends" count={query.data?.friends.length}>
              {query.isError ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Couldn't load your friends. Try again in a moment.
                </p>
              ) : !query.data ? (
                <div className="h-12 animate-pulse rounded-md bg-secondary/40" />
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
              <p className="px-6 pb-6 text-sm text-destructive">
                That didn't go through. Try again in a moment.
              </p>
            )}
          </Card>
        )}
      </div>
    </main>
  )
}
