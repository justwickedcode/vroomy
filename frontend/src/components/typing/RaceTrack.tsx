import { Flag } from 'lucide-react'
import { cn } from '#/lib/utils'
import CarIcon from '#/components/typing/CarIcon'

export interface Racer {
  id: string
  name: string
  progress: number
  wpm: number
  isYou?: boolean
  finished?: boolean
  color?: string
}

function carLeft(racer: Racer) {
  if (racer.finished) return 95
  return Math.min(Math.max(racer.progress * 100, 5), 90)
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
        <div className="race-track-inner">
          <div
            className="race-track-fill"
            style={{ width: `${Math.min(racer.progress, 1) * 100}%` }}
          />
          <div className="race-track-start" />
        </div>

        <CarIcon
          color={color}
          className={cn(
            'race-car h-9 w-16 drop-shadow-[0_4px_6px_rgb(0_0_0/0.45)]',
            racing && 'race-car-bob',
          )}
          style={{ left: `${carLeft(racer)}%` }}
        />

        <Flag className="race-flag size-6 text-white/70" />
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
