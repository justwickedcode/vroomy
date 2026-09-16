import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import MultiplayerRace from '#/components/typing/MultiplayerRace'

// "new" is a reserved sentinel roomCode meaning "mint one" rather than "join this one" — real
// codes are always exactly 6 characters from backend/ws's codeAlphabet (see private.go), so
// there's no possible collision with an actual room's code.
const CREATE_SENTINEL = 'new'

export const Route = createFileRoute('/race/$roomCode')({
  component: RoomPage,
})

function RoomPage() {
  const { roomCode } = Route.useParams()
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
    if (roomCode === CREATE_SENTINEL) mp.createRoom()
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
