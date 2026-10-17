import { cn } from '#/lib/utils'

// A row of chunky pixel blocks that fill up with a value — the readable stand-in for a dial
// wherever there's room for a strip instead. `frac` is 0..1; `segments` blocks light up in
// proportion, in the meter's color, against dim unlit ones.
export default function PixelMeter({
  frac,
  segments = 10,
  color = 'var(--color-signal)',
  className,
}: {
  frac: number
  segments?: number
  color?: string
  className?: string
}) {
  const lit = Math.round(Math.max(0, Math.min(1, frac)) * segments)
  return (
    <div
      className={cn('flex gap-[3px]', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(frac * 100)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-3 flex-1"
          style={{
            background:
              i < lit ? color : 'color-mix(in oklab, white 10%, transparent)',
            boxShadow: i < lit ? 'inset 0 -3px 0 rgb(0 0 0 / 25%)' : undefined,
          }}
        />
      ))}
    </div>
  )
}
