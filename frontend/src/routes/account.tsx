import { createFileRoute } from '@tanstack/react-router'
import { LogIn, LogOut } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import PixelSkyline from '#/components/typing/PixelSkyline'
import { PlayPanel, StartButton } from '#/components/play/PlayKit'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'

export const Route = createFileRoute('/account')({ component: AccountPage })

// One connected panel like the rest of the app: the skyline as a banner, then who you are (or
// the way in).
function AccountPage() {
  const { user, loaded } = useCurrentUser()

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap rise-in max-w-2xl">
        <PlayPanel>
          <div className="relative">
            <PixelSkyline className="h-32 sm:h-40" />
            <h1 className="absolute top-4 left-5 font-display text-3xl uppercase [text-shadow:3px_3px_0_#1a0b2e]">
              Account
            </h1>
          </div>

          {!loaded ? (
            <div className="h-24 animate-pulse bg-card" />
          ) : user ? (
            <div className="flex flex-col items-center gap-4 bg-card p-5 text-center sm:flex-row sm:text-left">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="px-corners size-16 shrink-0"
                />
              ) : (
                <span className="px-corners flex size-16 shrink-0 items-center justify-center bg-secondary font-display text-2xl">
                  {(user.name ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-2xl uppercase">
                  {user.name ?? 'Racer'}
                </p>
                {user.email && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </div>
              <Button asChild variant="outline">
                <a href="/logout">
                  <LogOut />
                  Log out
                </a>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Log in to keep your races, coins and garage on every device.
              </p>
              <StartButton asChild className="sm:w-80">
                <a href="/login">
                  <LogIn />
                  Log in
                </a>
              </StartButton>
            </div>
          )}
        </PlayPanel>
      </div>
    </main>
  )
}
