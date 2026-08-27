import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'
import type { CarModel } from '#/components/typing/CarIcon'

export interface Racer {
  id: string
  name: string
  progress: number
  wpm: number
  isYou?: boolean
  finished?: boolean
  color?: string
  model?: CarModel
}

function carLeft(racer: Racer) {
  if (racer.finished) return 91
  return Math.min(Math.max(racer.progress * 100, 6), 88)
}

function Lane({ racer }: { racer: Racer }) {
  const color =
    racer.color ?? (racer.isYou ? 'var(--color-primary)' : '#94a3b8')
  const racing = racer.progress > 0 && !racer.finished

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span
          className={cn(
            'flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider',
            racer.isYou ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {racer.name}
          {racer.isYou && <span className="race-you-badge">you</span>}
        </span>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
          {racer.wpm} wpm
        </span>
      </div>

      <div className="race-track">
        <div
          className={cn(
            'race-track-inner',
            racing && 'race-track-inner--moving',
          )}
        >
          <div
            className="race-track-fill"
            style={{ width: `${Math.min(racer.progress, 1) * 100}%` }}
          />
          <div className="race-track-start" />
        </div>

        <div className="race-car-wrap" style={{ left: `${carLeft(racer)}%` }}>
          {racing && <span className="race-nitro" aria-hidden="true" />}
          <CarIcon
            color={color}
            model={racer.model ?? 'sport'}
            className={cn(
              'race-car-svg aspect-[8/5] w-28 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]',
              racing && 'race-car-bob',
            )}
          />
        </div>

        <span className="race-flag-checkered" aria-hidden="true" />
      </div>
    </div>
  )
}

export default function RaceTrack({ racers }: { racers: Array<Racer> }) {
  return (
    <div className="flex flex-col gap-4">
      {racers.map((racer) => (
        <Lane key={racer.id} racer={racer} />
      ))}
    </div>
  )
}
