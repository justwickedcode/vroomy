import PixelIcon from '#/components/ui/PixelIcon'
import { cn } from '#/lib/utils'

// A coin amount with the pixel coin in front — the garage balance, item prices, and "+42" on a
// finish screen all use this so coins look the same everywhere.
export default function Coins({
  amount,
  prefix = '',
  className,
}: {
  amount: number
  prefix?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold tabular-nums',
        className,
      )}
    >
      <PixelIcon name="coin" />
      {prefix}
      {amount.toLocaleString()}
    </span>
  )
}
