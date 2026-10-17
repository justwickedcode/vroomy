import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import PixelIcon from '#/components/ui/PixelIcon'
import SoloPicker from '#/components/play/SoloPicker'
import FriendsPicker from '#/components/play/FriendsPicker'
import {
  AbilitiesSwitch,
  PlayPanel,
  PlaySection,
  StartButton,
  TileGrid,
  tileClass,
} from '#/components/play/PlayKit'
import { ArrowRight } from '#/components/ui/icons'

// Every way to start a race, in one panel: pick Solo, Multiplayer or Friends, with or without
// abilities, then that mode's own options and the start button. The dashboard's Play modal and
// the /race/solo, /race/multiplayer and /race/friends pages all show this.

export type PlayMode = 'solo' | 'multiplayer' | 'friends'

const MODES = [
  { id: 'solo', label: 'Solo', blurb: 'You vs bots', icon: 'flag' },
  {
    id: 'multiplayer',
    label: 'Multiplayer',
    blurb: 'Quick match',
    icon: 'users',
  },
  { id: 'friends', label: 'Friends', blurb: 'Private room', icon: 'link' },
] as const

export default function PlayPicker({
  initialMode = 'solo',
}: {
  initialMode?: PlayMode
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<PlayMode>(initialMode)
  const [abilities, setAbilities] = useState(false)

  return (
    <PlayPanel>
      <PlaySection label="Race">
        <TileGrid className="grid-cols-3">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={tileClass(mode === option.id)}
            >
              <PixelIcon name={option.icon} className="size-7 shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-display text-base uppercase">
                  {option.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {option.blurb}
                </span>
              </span>
            </button>
          ))}
        </TileGrid>
      </PlaySection>

      <PlaySection label="Abilities">
        <AbilitiesSwitch on={abilities} onChange={setAbilities} />
      </PlaySection>

      {mode === 'solo' && <SoloPicker abilities={abilities} />}
      {mode === 'friends' && <FriendsPicker abilities={abilities} />}
      {mode === 'multiplayer' && (
        <div className="bg-card p-4">
          <StartButton
            onClick={() =>
              void navigate({
                to: '/race/multiplayer',
                search: { mode: abilities ? 'powerups' : 'classic' },
              })
            }
          >
            Find a race
            <ArrowRight />
          </StartButton>
        </div>
      )}
    </PlayPanel>
  )
}
