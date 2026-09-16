import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMultiplayerRace } from '#/lib/multiplayer/useMultiplayerRace'
import MultiplayerRace from '#/components/typing/MultiplayerRace'

export const Route = createFileRoute('/race/multiplayer')({
  component: QuickMatchPage,
})

function QuickMatchPage() {
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
    mp.quickMatch()
  }, [])

  return <MultiplayerRace mp={mp} onLeave={() => navigate({ to: '/play' })} />
}
