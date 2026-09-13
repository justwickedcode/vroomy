import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Copy, Users } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import CarIcon from '#/components/typing/CarIcon'
import { useProfile } from '#/lib/profile/useProfile'

export const Route = createFileRoute('/race/$roomCode')({
  component: RoomPage,
})

function RoomPage() {
  const { roomCode } = Route.useParams()
  const { carModel, carColor } = useProfile()
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const shareLink = origin ? `${origin}/race/${roomCode}` : `/race/${roomCode}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API unavailable (permissions, insecure context) — the
      // link is still right there on screen to copy by hand.
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden">
          <CardHeader className="items-center py-8 text-center">
            <Badge variant="outline" className="mb-3">
              Room · not connected yet
            </Badge>
            <p className="stat-figure text-3xl tracking-[0.2em] text-primary">
              {roomCode.toUpperCase()}
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Share this link — once the multiplayer backend is live, anyone who
              opens it lands in this room with you.
            </p>
          </CardHeader>
          <div className="glass-divider" />
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                {shareLink}
              </span>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="text-success" /> : <Copy />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>

            <div className="glass-chip flex items-center gap-3 rounded-lg p-3">
              <CarIcon
                color={carColor}
                model={carModel}
                className="aspect-[8/5] w-14"
              />
              <div>
                <p className="text-sm font-bold">You</p>
                <p className="text-xs text-muted-foreground">
                  Waiting for friends to join…
                </p>
              </div>
            </div>

            <Button disabled className="w-full">
              <Users />
              Start race — needs backend
            </Button>

            <Link
              to="/play"
              className="text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 inline size-3" />
              Back to play
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
