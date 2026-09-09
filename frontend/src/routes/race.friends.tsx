import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Link2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/race/friends')({
  component: FriendsPage,
})

// No backend yet (see README §11/§18 Phase 4) — a room code is just a
// random client-side string for now. Once the `ws` service exists this is
// the one spot that swaps to an actual "create room" API call.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

function FriendsPage() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')

  function handleCreate() {
    navigate({
      to: '/race/$roomCode',
      params: { roomCode: generateRoomCode() },
    })
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    navigate({ to: '/race/$roomCode', params: { roomCode: code } })
  }

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Race with friends.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a room and send the link, or join one you were sent.
          </p>
        </div>

        <Card className="rise-in overflow-hidden">
          <CardHeader className="py-5">
            <p className="kicker">Create a room</p>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <Button onClick={handleCreate}>
              <Link2 />
              Create room
            </Button>
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Join a room</p>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                maxLength={6}
                className="flex-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-mono tracking-widest uppercase outline-none focus-visible:border-primary"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!joinCode.trim()}
              >
                Join
                <ArrowRight />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
