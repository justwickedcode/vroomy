import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '#/components/ui/card'
import SoloPicker from '#/components/play/SoloPicker'

export const Route = createFileRoute('/race/solo/')({ component: SoloSetup })

// The same picker as the dashboard's Solo modal, as a page for direct links.
function SoloSetup() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-3xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-5">
            <SoloPicker />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
