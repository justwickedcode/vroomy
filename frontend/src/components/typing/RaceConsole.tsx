import PixelIcon from '#/components/ui/PixelIcon'
import { ExternalLink } from '#/components/ui/icons'
import { cn } from '#/lib/utils'
import type { PowerupKind } from '#/lib/powerups'

// The car's dashboard under the typing screen, so the bottom of a race reads as one machine
// instead of loose text: an arcade item box for the equipped power-up on the left, glowing LCD
// readouts in the middle, and the quote's author and source on the car radio on the right.

export interface ConsolePowerup {
  kind: PowerupKind
  label: string
  detail: string
  // Still unused this race.
  ready: boolean
  // Can be fired right now (ready, and the race is on).
  canFire: boolean
  onFire: () => void
}

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

// Only http(s) links are rendered — sourceUrl comes from scraped data, and anything else (a
// javascript: URL, say) must never become a clickable href.
function safeSource(sourceUrl?: string | null): URL | null {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function ItemBox({ powerup }: { powerup: ConsolePowerup }) {
  const { kind, label, detail, ready, canFire, onFire } = powerup
  return (
    <button
      type="button"
      onClick={onFire}
      disabled={!canFire}
      title={detail}
      className="group flex items-center gap-3 text-left disabled:cursor-default"
    >
      <span
        className={cn(
          'race-itembox',
          ready ? 'race-itembox--ready' : 'race-itembox--used',
        )}
      >
        <PixelIcon name={kind} className="size-8" />
        {ready && <kbd className="race-keycap">Tab</kbd>}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold">{label}</span>
        <span
          className={cn(
            'font-mono text-[0.65rem] tracking-widest uppercase',
            ready ? 'text-signal' : 'text-muted-foreground',
          )}
        >
          {ready ? 'Ready' : 'Used'}
        </span>
      </span>
    </button>
  )
}

function Lcd({
  value,
  label,
  big,
}: {
  value: string | number
  label: string
  big?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-1.5">
      <span className={cn('race-lcd-value', big && 'text-3xl')}>{value}</span>
      <span className="race-lcd-label">{label}</span>
    </div>
  )
}

export default function RaceConsole({
  wpm,
  accuracy,
  elapsedMs,
  powerup,
  author,
  sourceUrl,
}: {
  wpm: number
  accuracy: number
  elapsedMs: number
  powerup?: ConsolePowerup
  author?: string | null
  sourceUrl?: string | null
}) {
  const source = safeSource(sourceUrl)
  return (
    <div className="race-console">
      <div className="flex min-w-0 items-center">
        {powerup && <ItemBox powerup={powerup} />}
      </div>

      <div className="race-lcd">
        <Lcd value={wpm} label="wpm" big />
        <Lcd value={`${accuracy}%`} label="acc" />
        <Lcd value={formatTime(elapsedMs)} label="time" />
      </div>

      <div className="flex min-w-0 justify-end">
        {(author || source) && (
          <div className="race-radio">
            <span className="race-radio-dial" aria-hidden="true" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-bold text-[#a5f3fc]">
                {author ?? 'Unknown'}
              </span>
              {source && (
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Where this quote was found"
                  className="inline-flex items-center gap-1 truncate font-mono text-[0.65rem] text-[#a5f3fc]/60 hover:text-[#a5f3fc]"
                >
                  {source.hostname.replace(/^www\./, '')}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
