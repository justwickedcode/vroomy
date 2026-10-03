import { createFileRoute } from '@tanstack/react-router'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'

export const Route = createFileRoute('/account')({ component: AccountPage })

function AccountPage() {
  const { user, loaded } = useCurrentUser()

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Account.
          </h1>
        </div>

        {!loaded ? (
          <Card className="rise-in overflow-hidden">
            <CardContent className="flex items-center gap-4 pt-6 pb-6">
              <div className="size-16 animate-pulse rounded-full bg-secondary/40" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-secondary/40" />
                <div className="h-3 w-48 animate-pulse rounded bg-secondary/40" />
              </div>
            </CardContent>
          </Card>
        ) : user ? (
          <Card className="rise-in overflow-hidden">
            <CardContent className="flex flex-col items-center gap-4 pt-10 pb-8 text-center sm:flex-row sm:items-center sm:text-left">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-full"
                />
              ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold">
                  {(user.name ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-xl font-bold">
                  {user.name ?? 'Account'}
                </p>
                {user.email && (
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </div>
            </CardContent>

            <div className="glass-divider" />

            <CardContent className="flex justify-center pt-6 pb-6 sm:justify-start">
              <Button asChild variant="outline">
                <a href="/logout">
                  <LogOut className="size-4" />
                  Log out
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rise-in overflow-hidden text-center">
            <CardHeader className="items-center py-10">
              <UserRound className="mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">Not logged in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Log in to keep your stats, cosmetics, and race history tied
                to your account.
              </p>
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
        )}
      </div>
    </main>
  )
}
