import { Keyboard } from 'lucide-react'
import PixelIcon from '#/components/ui/PixelIcon'
import { useProfile } from '#/lib/profile/useProfile'
import { POWERUPS } from '#/lib/powerups'
import { cn } from '#/lib/utils'
import type { LobbyMode } from '#/lib/multiplayer/useMultiplayerRace'

// The two kinds of multiplayer room. Shown before quick match and when creating a friends room;
// players are only matched with others who picked the same.
export default function LobbyModePicker({
  value,
  onSelect,
}: {
  value?: LobbyMode
  onSelect: (mode: LobbyMode) => void
}) {
  const { equippedPowerup } = useProfile()
  const powerup = POWERUPS.find((p) => p.id === equippedPowerup)

  const options: Array<{
    mode: LobbyMode
    title: string
    detail: string
    icon: React.ReactNode
  }> = [
    {
      mode: 'classic',
      title: 'Classic',
      detail: 'Just typing. Fastest fingers win.',
      icon: <Keyboard className="size-7 text-muted-foreground" />,
    },
    {
      mode: 'powerups',
      title: 'Power-ups',
      detail: powerup
        ? `Bring your ${powerup.label} and fire it once per race with Tab.`
        : 'Fire your equipped power-up once per race with Tab.',
      icon: <PixelIcon name={equippedPowerup} className="size-8" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onSelect(option.mode)}
          className={cn(
            'glass-chip flex items-center gap-4 rounded-xl p-4 text-left transition-colors',
            value === option.mode && 'border-primary bg-primary/12',
          )}
        >
          {option.icon}
          <span>
            <p className="text-sm font-bold">{option.title}</p>
            <p className="text-xs text-muted-foreground">{option.detail}</p>
          </span>
        </button>
      ))}
    </div>
  )
}
