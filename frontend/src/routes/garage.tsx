import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CarIcon, { CAR_MODELS } from '#/components/typing/CarIcon'
import { CAR_COLORS, useProfile } from '#/lib/profile/useProfile'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { CarModel } from '#/components/typing/CarIcon'

export const Route = createFileRoute('/garage')({ component: GaragePage })

function GaragePage() {
  const { carModel, carColor, setCarModel, setCarColor } = useProfile()

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Pick your ride.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved automatically.
          </p>
        </div>

        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-6">
            <div className="race-track mb-8">
              <div className="race-track-inner">
                <div className="race-track-fill" style={{ width: '38%' }} />
                <div className="race-track-start" />
              </div>
              <div className="race-car-wrap" style={{ left: '38%' }}>
                <CarIcon
                  color={carColor}
                  model={carModel}
                  className="race-car-svg race-car-bob aspect-[8/5] w-36 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]"
                />
              </div>
              <span className="race-flag-checkered" aria-hidden="true" />
            </div>
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Model</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-3 lg:grid-cols-4">
            {CAR_MODELS.map((option) => (
              <ModelOption
                key={option.id}
                id={option.id}
                label={option.label}
                color={carColor}
                selected={option.id === carModel}
                onSelect={() => setCarModel(option.id)}
              />
            ))}
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Paint</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-0 pb-8">
            {CAR_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                aria-label={swatch.id}
                onClick={() => setCarColor(swatch.value)}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                  swatch.value === carColor
                    ? 'border-foreground'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: swatch.value }}
              >
                {swatch.value === carColor && (
                  <Check className="size-4 text-white drop-shadow" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function ModelOption({
  id,
  label,
  color,
  selected,
  onSelect,
}: {
  id: CarModel
  label: string
  color: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseMove={handleTiltMove}
      onMouseLeave={handleTiltLeave}
      className={cn(
        'tilt-card speed-option glass-chip flex flex-col items-center gap-2 py-4',
        selected && 'border-primary bg-primary/12',
      )}
    >
      <CarIcon color={color} model={id} className="aspect-[8/5] w-24" />
      <span className="text-sm font-bold">{label}</span>
    </button>
  )
}
