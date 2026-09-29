import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CarIcon from '#/components/typing/CarIcon'
import { LIVERIES } from '#/lib/liveries'
import { useProfile } from '#/lib/profile/useProfile'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'

export const Route = createFileRoute('/themes')({ component: ThemesPage })

function ThemesPage() {
  const {
    carModel,
    carColor,
    carLivery,
    equippedUpgrades,
    setCarLivery,
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
            Themes.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Patterns for your current ride — change model or paint in the
            Garage.
          </p>
        </div>

        <Card className="rise-in overflow-hidden">
          <CardHeader className="py-5">
            <p className="kicker">Livery</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8 sm:grid-cols-3">
            {LIVERIES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCarLivery(option.id)}
                onMouseMove={handleTiltMove}
                onMouseLeave={handleTiltLeave}
                className={cn(
                  'tilt-card speed-option glass-chip flex flex-col items-center gap-3 py-5',
                  option.id === carLivery && 'border-primary bg-primary/12',
                )}
              >
                <CarIcon
                  color={carColor}
                  model={carModel}
                  livery={option.id}
                  upgrades={equippedUpgrades}
                  className="w-24"
                />
                <span className="text-sm font-bold">{option.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
