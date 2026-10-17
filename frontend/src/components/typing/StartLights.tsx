import { cn } from '#/lib/utils'

// The race start, F1 style: a pixel light gantry over the track where one red light comes on
// per second of the countdown, then at GO they all snap to green with a flash. `remaining` is
// the seconds left (0 = GO), `total` how many lights the gantry has.
export default function StartLights({
  remaining,
  total,
}: {
  remaining: number
  total: number
}) {
  const go = remaining <= 0
  const lit = go ? total : Math.min(total, total - remaining + 1)
  return (
    <div
      className={cn('start-lights', go && 'start-lights--go')}
      role="timer"
      aria-live="assertive"
      aria-label={go ? 'Go!' : `${remaining}`}
    >
      <div className="start-lights-gantry">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('start-light', i < lit && 'is-on')} />
        ))}
      </div>
      {go && <span className="start-lights-go">GO!</span>}
    </div>
  )
}
