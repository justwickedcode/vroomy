import { createFileRoute, notFound } from '@tanstack/react-router'
import TypingRace from '#/components/typing/TypingRace'
import { SPEED_RANGES } from '#/lib/typing/useBotRacers'
import type { SpeedRange } from '#/lib/typing/useBotRacers'

// User-picked pace from the custom slider arrives as "custom-<wpm>" rather
// than one of the fixed preset ids — reconstruct a SpeedRange around it
// (±8 wpm) so the bot still wobbles instead of holding a flat line.
function parseCustomSpeed(id: string): SpeedRange | null {
  const match = /^custom-(\d+)$/.exec(id)
  if (!match) return null
  const target = Number(match[1])
  return {
    id,
    label: 'Custom',
    wpm: [Math.max(5, target - 8), target + 8],
  }
}

export const Route = createFileRoute('/race/solo/$speed')({
  loader: ({ params }) => {
    const range =
      SPEED_RANGES.find((r) => r.id === params.speed) ??
      parseCustomSpeed(params.speed)
    if (!range) throw notFound()
    return range
  },
  component: SoloRace,
})

function SoloRace() {
  const speedRange = Route.useLoaderData()

  return (
    <main className="flex-1 px-4 py-6">
      <div className="page-wrap flex flex-col">
        <TypingRace speedRange={speedRange} />
      </div>
    </main>
  )
}
