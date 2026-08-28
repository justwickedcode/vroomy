import { createFileRoute, notFound } from '@tanstack/react-router'
import TypingRace from '#/components/typing/TypingRace'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'

export const Route = createFileRoute('/race/solo/$speed')({
  loader: ({ params }) => {
    const range = SPEED_RANGES.find((r) => r.id === params.speed)
    if (!range) throw notFound()
    return range
  },
  component: SoloRace,
})

function SoloRace() {
  const speedRange = Route.useLoaderData()

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <TypingRace speedRange={speedRange} />
      </div>
    </main>
  )
}
