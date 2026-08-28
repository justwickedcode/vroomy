import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import SpeedTile from '#/components/typing/SpeedTile'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'

export const Route = createFileRoute('/race/solo/')({ component: SoloSetup })

function SoloSetup() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SPEED_RANGES.map((range, i) => (
                <SpeedTile key={range.id} range={range} index={i} />
              ))}
            </div>

            <Button variant="outline" className="mt-6" asChild>
              <Link to="/">
                <ArrowLeft />
                Back
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
