import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import type { LobbyMode } from '#/lib/multiplayer/useMultiplayerRace'
import MultiplayerRace from '#/components/typing/MultiplayerRace'
import DesktopOnlyRace from '#/components/typing/DesktopOnlyRace'
import { useIsDesktopViewport } from '#/lib/layout/useIsDesktopViewport'
import { useProfile } from '#/lib/profile/useProfile'

// "new" is a reserved sentinel roomCode meaning "mint one" rather than "join this one" — real
// codes are always exactly 6 characters from backend/ws's codeAlphabet (see private.go), so
// there's no possible collision with an actual room's code.
const CREATE_SENTINEL = 'new'

// ?mode= only matters when creating ("new"): it's the lobby type the host picked on
// /race/friends. Joiners get whatever the room already is.
export const Route = createFileRoute('/race/$roomCode')({
  validateSearch: (search: Record<string, unknown>): { mode?: LobbyMode } => ({
    mode: search.mode === 'powerups' ? 'powerups' : undefined,
  }),
  component: RoomGate,
})

// Gates on viewport before useMultiplayerRace is ever called — not just before rendering its
// result — so the create/join WebSocket connect below never fires on mobile at all.
function RoomGate() {
  const isDesktop = useIsDesktopViewport()
  // Waits for the login check and the profile too, so the connection carries the player's name
  // and the car they actually drive.
  const { hydrated: loaded } = useProfile()

  if (isDesktop === false) return <DesktopOnlyRace />
  if (isDesktop === null || !loaded) return null

  return <RoomPage />
}

function RoomPage() {
  const { roomCode } = Route.useParams()
  const { mode } = Route.useSearch()
  const navigate = useNavigate()
  const mp = useMultiplayerRace()

  // Deliberately [] (not [roomCode]): this must run once per mount, using whatever roomCode the
  // page first loaded with — not re-fire later when the create-then-replace-the-URL effect
  // below changes this same param out from under it. Dev mode mounts this effect twice (mount →
  // cleanup → mount again, to catch missing cleanup) — connect()'s own socketRef.current?.close()
  // already makes that safe by opening a fresh socket on the second, real mount; see
  // useMultiplayerRace's isCurrent() guard for why the first (superseded) socket's belated
  // events can't corrupt the state the second one goes on to build.
  useEffect(() => {
    if (roomCode === CREATE_SENTINEL) mp.createRoom(mode ?? 'classic')
    else mp.joinRoom(roomCode)
  }, [])

  // Once the server hands back a real code for a freshly created room, swap the URL to it —
  // same route, only the param changes, so this doesn't remount the page or disturb the
  // already-open WebSocket connection. Without this, refreshing or sharing the URL while still
  // on /race/new would be meaningless.
  useEffect(() => {
    if (roomCode === CREATE_SENTINEL && mp.code) {
      navigate({
        to: '/race/$roomCode',
        params: { roomCode: mp.code },
        replace: true,
      })
    }
  }, [roomCode, mp.code, navigate])

  return (
    <MultiplayerRace
      mp={mp}
      onLeave={() => navigate({ to: '/race/friends' })}
    />
  )
}
