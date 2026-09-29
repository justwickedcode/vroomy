import { Link } from '@tanstack/react-router'
import { ArrowLeft, Monitor } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'

// The race track and its keyboard-driven typing are built for a bigger screen — rather than
// squeezing the track's fixed-width billboard/grandstand layout onto a phone, racing is desktop
// (and tablet, landscape-and-up) only. See useIsDesktopViewport for the breakpoint this pairs
// with.
export default function DesktopOnlyRace() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden text-center">
          <CardHeader className="items-center py-10">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Monitor className="size-5" />
            </span>
            <Badge variant="outline" className="mb-3">
              Desktop only
            </Badge>
            <h1 className="text-xl font-extrabold tracking-tight">
              Racing needs a bigger screen.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The race track and keyboard-driven typing are built for a laptop or desktop. Grab
              a bigger screen to race — your garage and stats are still here on mobile.
            </p>
          </CardHeader>
          <CardContent className="pb-8">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft />
                Back to dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
