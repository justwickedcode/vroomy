import { createFileRoute } from '@tanstack/react-router'
import { Check, Crosshair, Flame, Magnet, Radar, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CarIcon, { VEHICLE_CATEGORIES, VEHICLES } from '#/components/typing/CarIcon'
import { Trail } from '#/components/typing/RaceTrack'
import { CAR_COLORS, useProfile } from '#/lib/profile/useProfile'
import { TRAILS } from '#/lib/trails'
import { POWERUPS } from '#/lib/powerups'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { CarModel, VehicleCategory } from '#/components/typing/CarIcon'
import type { PowerupKind } from '#/lib/powerups'

export const Route = createFileRoute('/garage')({ component: GaragePage })

const POWERUP_ICONS: Record<PowerupKind, typeof Zap> = {
  boost: Zap,
  nitro: Flame,
  shell: Crosshair,
  emp: Radar,
  magnet: Magnet,
}

function GaragePage() {
  const {
    carModel,
    underglow,
    underglowColor,
    trail,
    equippedPowerup,
    setCarModel,
    setUnderglow,
    setUnderglowColor,
    setTrail,
    setEquippedPowerup,
  } = useProfile()

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Garage.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Model and upgrades — saved automatically. Everything's unlocked
            for now.
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
                <Trail variant={trail} />
                <CarIcon
                  model={carModel}
                  underglow={underglow}
                  underglowColor={underglowColor}
                  className="race-car-svg race-car-bob w-36 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]"
                />
              </div>
              <span className="race-flag-checkered" aria-hidden="true" />
            </div>
          </CardContent>

          {VEHICLE_CATEGORIES.map((category) => (
            <CategorySection
              key={category}
              category={category}
              carModel={carModel}
              onSelect={setCarModel}
            />
          ))}

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Underglow</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0 pb-8">
            <button
              type="button"
              onClick={() => setUnderglow(!underglow)}
              className={cn(
                'glass-chip flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors',
                underglow && 'border-primary bg-primary/12',
              )}
            >
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: underglowColor }}
              />
              <span className="flex-1">
                <p className="text-sm font-bold">Neon underglow</p>
                <p className="text-xs text-muted-foreground">
                  Pick any color below.
                </p>
              </span>
              {underglow && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                  <Check className="size-3.5" />
                  On
                </span>
              )}
            </button>
            {underglow && (
              <div className="flex flex-wrap items-center gap-3 pl-1">
                {CAR_COLORS.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    aria-label={`${swatch.id} underglow`}
                    onClick={() => setUnderglowColor(swatch.value)}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                      swatch.value === underglowColor
                        ? 'border-foreground'
                        : 'border-transparent',
                    )}
                    style={{ backgroundColor: swatch.value }}
                  >
                    {swatch.value === underglowColor && (
                      <Check className="size-3.5 text-white drop-shadow" />
                    )}
                  </button>
                ))}
                {/* A native color input, not another swatch row — the 8 presets above cover
                    "pick a nice color fast", this covers "no really, this exact hex". */}
                <label
                  className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground"
                  title="Custom color"
                >
                  <input
                    type="color"
                    value={underglowColor}
                    onChange={(event) => setUnderglowColor(event.target.value)}
                    className="absolute -inset-2 cursor-pointer opacity-0"
                    aria-label="Custom underglow color"
                  />
                  <span
                    aria-hidden="true"
                    className="size-full"
                    style={{
                      background:
                        'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                    }}
                  />
                </label>
              </div>
            )}
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Trail</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8 sm:grid-cols-4">
            {TRAILS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTrail(option.id)}
                className={cn(
                  'glass-chip relative flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-colors',
                  option.id === trail && 'border-primary bg-primary/12',
                )}
              >
                {/* Live preview, not just a name — the trail is rendered exactly like it is
                    mid-race (see RaceTrack's Trail), anchored to a small dot standing in for
                    the car so the effect has something to trail off of. */}
                <div className="flex h-7 w-16 items-center justify-end">
                  <span className="relative inline-block size-2 shrink-0 rounded-full bg-foreground/70">
                    <Trail variant={option.id} />
                  </span>
                </div>
                <p className="text-sm font-bold">{option.label}</p>
              </button>
            ))}
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Powerups</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8">
            {POWERUPS.map((option) => {
              const Icon = POWERUP_ICONS[option.id]
              const equipped = option.id === equippedPowerup
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setEquippedPowerup(option.id)}
                  className={cn(
                    'glass-chip flex items-center gap-3 rounded-xl p-4 text-left transition-colors',
                    equipped && 'border-primary bg-primary/12',
                  )}
                >
                  <Icon className="size-5 shrink-0 text-primary" />
                  <span className="flex-1">
                    <p className="text-sm font-bold">{option.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.detail}
                    </p>
                  </span>
                  {equipped && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      <Check className="size-3.5" />
                      Equipped
                    </span>
                  )}
                </button>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function CategorySection({
  category,
  carModel,
  onSelect,
}: {
  category: VehicleCategory
  carModel: CarModel
  onSelect: (id: CarModel) => void
}) {
  const models = VEHICLES.filter((v) => v.category === category)
  return (
    <>
      <div className="glass-divider" />
      <CardHeader className="py-5">
        <p className="kicker">{category}</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-3 lg:grid-cols-4">
        {models.map((vehicle) => (
          <ModelOption
            key={vehicle.id}
            id={vehicle.id}
            label={vehicle.label}
            selected={vehicle.id === carModel}
            onSelect={() => onSelect(vehicle.id)}
          />
        ))}
      </CardContent>
    </>
  )
}

function ModelOption({
  id,
  label,
  selected,
  onSelect,
}: {
  id: CarModel
  label: string
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
        'tilt-card speed-option glass-chip relative flex flex-col items-center gap-2 py-4',
        selected && 'border-primary bg-primary/12',
      )}
    >
      <CarIcon model={id} className="w-24" />
      <span className="text-sm font-bold">{label}</span>
    </button>
  )
}
