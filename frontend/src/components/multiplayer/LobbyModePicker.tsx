import PixelIcon from '#/components/ui/PixelIcon'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { LobbyMode } from '#/lib/multiplayer/useMultiplayerRace'

// The two kinds of multiplayer room, styled like the Solo picker's switch: with abilities (your
// equipped one recharges through the race) or without. Shown before quick match and when
// creating a friends room; players are only matched with others who picked the same.
export default function LobbyModePicker({
  value,
  onSelect,
}: {
  value?: LobbyMode
  onSelect: (mode: LobbyMode) => void
}) {
  const { equippedPowerup } = useProfile()

  const options = [
    {
      mode: 'powerups',
      title: 'With abilities',
      blurb: 'Yours recharges through the race',
      icon: <PixelIcon name={equippedPowerup} className="size-8" />,
    },
    {
      mode: 'classic',
      title: 'Without',
      blurb: 'Just typing',
      icon: <PixelIcon name="keyboard" className="size-8" />,
    },
  ] as const satisfies ReadonlyArray<
    { mode: LobbyMode } & Record<string, unknown>
  >

  return (
    <div className="grid grid-cols-1 gap-[2px] border-2 border-border bg-border sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onSelect(option.mode)}
          className={cn(
            'flex items-center gap-3 p-4 text-left transition-colors',
            value === option.mode
              ? 'bg-[#2a1238] shadow-[inset_0_-3px_0_#ff2fb4]'
              : 'bg-card hover:bg-accent',
          )}
        >
          {option.icon}
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg uppercase">
              {option.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {option.blurb}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
