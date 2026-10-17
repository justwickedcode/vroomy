import { createFileRoute, notFound } from '@tanstack/react-router'
import TypingRace from '#/components/typing/TypingRace'
import DesktopOnlyRace from '#/components/typing/DesktopOnlyRace'
import { useIsDesktopViewport } from '#/lib/layout/useIsDesktopViewport'
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
  // ?chaos=true: the item-roulette mode where the bots fire abilities too.
  validateSearch: (search: Record<string, unknown>): { chaos?: boolean } =>
    search.chaos === true || search.chaos === 'true' ? { chaos: true } : {},
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
  const { chaos } = Route.useSearch()
  const isDesktop = useIsDesktopViewport()

  if (isDesktop === false) return <DesktopOnlyRace />
  if (isDesktop === null) return null

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap flex flex-col">
        <TypingRace
          key={chaos ? 'chaos' : 'classic'}
          speedRange={speedRange}
          chaos={chaos ?? false}
        />
      </div>
    </main>
  )
}
