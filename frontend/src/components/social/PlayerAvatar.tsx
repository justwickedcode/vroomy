import { cn } from '#/lib/utils'

// Same look as the account page's avatar: the identity provider's picture when there is one,
// otherwise the name's initial.
export default function PlayerAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl?: string
  className?: string
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(
          'px-corners size-7 shrink-0 object-cover [image-rendering:pixelated]',
          className,
        )}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'px-corners pixel-text flex size-7 shrink-0 items-center justify-center bg-secondary text-xs font-semibold',
        className,
      )}
    >
      {(name.trim() || '?').charAt(0).toUpperCase()}
    </span>
  )
}
