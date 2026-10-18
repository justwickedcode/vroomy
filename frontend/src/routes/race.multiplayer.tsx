import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import PlayPicker from '#/components/play/PlayPicker'
import type { LobbyMode } from '#/lib/multiplayer/useMultiplayerRace'
import MultiplayerRace from '#/components/typing/MultiplayerRace'
import DesktopOnlyRace from '#/components/typing/DesktopOnlyRace'
import { useIsDesktopViewport } from '#/lib/layout/useIsDesktopViewport'
import { useProfile } from '#/lib/profile/useProfile'

// ?mode= picks the lobby; without it the page asks first. Kept in the URL so "race again" and
// a refresh go straight back into the same kind of lobby.
export const Route = createFileRoute('/race/multiplayer')({
  validateSearch: (search: Record<string, unknown>): { mode?: LobbyMode } => ({
    mode:
      search.mode === 'classic' || search.mode === 'powerups'
        ? search.mode
        : undefined,
  }),
  component: QuickMatchGate,
})

// Gates on viewport before useMultiplayerRace is ever called — not just before rendering its
// result — so the WebSocket connect below never fires on mobile at all, not even briefly.
function QuickMatchGate() {
  const isDesktop = useIsDesktopViewport()
  // Waits for the login check and the profile too, so the connection carries the player's name
  // and the car they actually drive.
  const { hydrated: loaded } = useProfile()

  if (isDesktop === false) return <DesktopOnlyRace />
  if (isDesktop === null || !loaded) return null

  return <QuickMatch />
}

function QuickMatch() {
  const { mode } = Route.useSearch()

  if (!mode) {
    return (
      <main className="flex flex-1 flex-col justify-center px-4 py-8">
        <div className="page-wrap rise-in max-w-3xl">
          <PlayPicker initialMode="multiplayer" />
        </div>
      </main>
    )
  }

  // Keyed by mode so switching lobby types is a fresh connection, not a reused one.
  return <QuickMatchPage key={mode} mode={mode} />
}

function QuickMatchPage({ mode }: { mode: LobbyMode }) {
  const navigate = useNavigate()
  const mp = useMultiplayerRace()

  // Dev mode mounts this effect twice (mount → cleanup → mount again, to catch missing
  // cleanup) — connect()'s own socketRef.current?.close() already makes a second call here
  // safe by opening a fresh socket for the second, real mount; see useMultiplayerRace's
  // isCurrent() guard for why the first (superseded) socket's belated events can't corrupt
  // state the second one goes on to build. A ref-guarded "only call this once" here would be
  // the wrong fix: it'd suppress the real reconnect and leave the app stuck on the first
  // socket, which is exactly the bug this comment used to have.
  useEffect(() => {
    mp.quickMatch(mode)
  }, [])

  return <MultiplayerRace mp={mp} onLeave={() => navigate({ to: '/' })} />
}
