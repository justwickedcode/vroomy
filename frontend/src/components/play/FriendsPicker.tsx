import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Link2 } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import LobbyModePicker from '#/components/multiplayer/LobbyModePicker'
import type { FormEvent } from 'react'
import type { LobbyMode } from '#/lib/multiplayer/useMultiplayerRace'

// Friends setup: create a private room (picking its lobby type) or join one by code. Used in
// the dashboard's Friends modal and on /race/friends.
export default function FriendsPicker() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<LobbyMode>('classic')

  function handleCreate() {
    // "new" is a reserved sentinel — /race/$roomCode asks backend/ws to mint a real room and
    // code (see private.go), then swaps the URL to that code once it arrives.
    void navigate({
      to: '/race/$roomCode',
      params: { roomCode: 'new' },
      search: { mode },
    })
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    void navigate({ to: '/race/$roomCode', params: { roomCode: code } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="kicker">Create a room</p>
        <LobbyModePicker value={mode} onSelect={setMode} />
        <Button onClick={handleCreate} className="self-start">
          <Link2 />
          Create room
        </Button>
      </div>
      <div className="glass-divider" />
      <div className="flex flex-col gap-3">
        <p className="kicker">Join a room</p>
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Room code"
            maxLength={6}
            className="px-corners flex-1 border-2 border-border bg-secondary/40 px-3 py-2 font-[family-name:var(--font-code)] text-sm tracking-widest uppercase outline-none focus-visible:border-primary"
          />
          <Button type="submit" variant="outline" disabled={!joinCode.trim()}>
            Join
            <ArrowRight />
          </Button>
        </form>
      </div>
    </div>
  )
}
