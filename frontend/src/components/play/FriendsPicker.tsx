import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Link2 } from '#/components/ui/icons'
import { Button } from '#/components/ui/button'
import { PlaySection, StartButton } from '#/components/play/PlayKit'
import type { FormEvent } from 'react'

// Friends' part of the Play picker (see PlayPicker): create a private room (with or without
// abilities, as picked above) and share its code, or join one by code.
export default function FriendsPicker({ abilities }: { abilities: boolean }) {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')

  function handleCreate() {
    // "new" is a reserved sentinel — /race/$roomCode asks backend/ws to mint a real room and
    // code (see private.go), then swaps the URL to that code once it arrives.
    void navigate({
      to: '/race/$roomCode',
      params: { roomCode: 'new' },
      search: { mode: abilities ? 'powerups' : 'classic' },
    })
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    void navigate({ to: '/race/$roomCode', params: { roomCode: code } })
  }

  return (
    <>
      <PlaySection label="Join a room">
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="CODE"
            maxLength={6}
            className="play-input flex-1 tracking-[0.3em] uppercase"
            aria-label="Room code"
          />
          <Button type="submit" variant="outline" disabled={!joinCode.trim()}>
            Join
            <ArrowRight />
          </Button>
        </form>
      </PlaySection>
      <div className="bg-card p-4">
        <StartButton onClick={handleCreate}>
          <Link2 />
          Create a room
        </StartButton>
      </div>
    </>
  )
}
