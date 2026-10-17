import PixelIcon from '#/components/ui/PixelIcon'
import { Button } from '#/components/ui/button'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

// The shared building blocks of every "start a race" screen (Solo, Multiplayer, Friends — in the
// dashboard's modals and on their own pages), so they all read as one design: a connected panel
// of cells, the same tiles, the same abilities switch, and the same big start button.

// One connected panel: its children are cells sharing single dividing lines.
export function PlayPanel({ children }: { children: ReactNode }) {
  return (
    <div className="px-corners grid gap-[2px] border-2 border-border bg-border">
      {children}
    </div>
  )
}

// A cell of the panel with a kicker label (and something on the right of it, optionally).
export function PlaySection({
  label,
  aside,
  children,
  className,
}: {
  label: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3 bg-card p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="kicker">{label}</p>
        {aside}
      </div>
      {children}
    </section>
  )
}

// A grid of tiles sharing single dividing lines (no empty-cell gaps on ragged rows).
export function TileGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid border-2 border-border [&>*]:shadow-[0_0_0_1px_var(--color-border)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

// The look of one tile: a dark cell that lights up on hover, pink-framed when it's the pick.
export function tileClass(selected = false) {
  return cn(
    'flex items-center gap-3 p-3 text-left transition-colors outline-none focus-visible:shadow-[inset_0_0_0_2px_#22d3ee]',
    selected
      ? 'bg-[#2a1238] shadow-[inset_0_0_0_2px_#ff2fb4]'
      : 'bg-card hover:bg-accent',
  )
}

// With or without abilities (your equipped one recharging through the race).
export function AbilitiesSwitch({
  on,
  onChange,
}: {
  on: boolean
  onChange: (on: boolean) => void
}) {
  const { equippedPowerup } = useProfile()
  const options = [
    {
      value: true,
      title: 'With abilities',
      blurb: 'Yours recharges through the race',
      icon: equippedPowerup,
    },
    {
      value: false,
      title: 'Without',
      blurb: 'Just typing',
      icon: 'keyboard',
    },
  ] as const
  return (
    <TileGrid className="grid-cols-2">
      {options.map((option) => (
        <button
          key={option.title}
          type="button"
          onClick={() => onChange(option.value)}
          className={tileClass(on === option.value)}
        >
          <PixelIcon name={option.icon} className="size-7 shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-display text-base uppercase">
              {option.title}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {option.blurb}
            </span>
          </span>
        </button>
      ))}
    </TileGrid>
  )
}

// The one big call to action at the bottom of a play screen.
export function StartButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className={cn('h-12 w-full font-display text-lg uppercase', className)}
      {...props}
    />
  )
}
