import { createFileRoute } from '@tanstack/react-router'
import { Check, Coins } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import CarIcon from '#/components/typing/CarIcon'
import { UPGRADES } from '#/lib/upgrades'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/garage-upgrades')({
  component: UpgradesPage,
})

function UpgradesPage() {
  const {
    hydrated,
    carModel,
    carColor,
    carLivery,
    credits,
    ownedUpgrades,
    equippedUpgrades,
    buyUpgrade,
    equipUpgrade,
  } = useProfile()

  const equippedId = equippedUpgrades.underglow

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              className="livery-stripe mb-4 w-16 rounded-full"
              aria-hidden="true"
            />
            <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
              Upgrades.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Earn credits by racing — faster laps and better placements pay
              more.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5">
            <Coins className="size-4 text-primary" />
            <span className="stat-figure text-xl text-primary">
              {hydrated ? credits : 0}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              credits
            </span>
          </div>
        </div>

        <Card className="rise-in overflow-hidden">
          <CardContent className="flex justify-center pt-6 pb-4">
            <CarIcon
              color={carColor}
              model={carModel}
              livery={carLivery}
              upgrades={equippedUpgrades}
              className="w-40"
            />
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Underglow</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8 sm:grid-cols-4">
            {UPGRADES.map((option) => {
              const owned = ownedUpgrades.includes(option.id)
              const equipped = equippedId === option.id
              const canAfford = hydrated && credits >= option.cost
              return (
                <div
                  key={option.id}
                  className={cn(
                    'glass-chip flex flex-col items-center gap-2 rounded-xl p-4 text-center',
                    equipped && 'border-primary bg-primary/12',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-8 rounded-full border border-border"
                    style={{ backgroundColor: option.color }}
                  />
                  <p className="text-sm font-bold">{option.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.detail}
                  </p>
                  {owned ? (
                    <Button
                      size="sm"
                      variant={equipped ? 'default' : 'outline'}
                      className="mt-1 w-full"
                      onClick={() =>
                        equipUpgrade(
                          'underglow',
                          equipped ? null : option.id,
                        )
                      }
                    >
                      {equipped ? (
                        <>
                          <Check />
                          Equipped
                        </>
                      ) : (
                        'Equip'
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 w-full"
                      disabled={!canAfford}
                      onClick={() => buyUpgrade(option.id)}
                    >
                      {option.cost} credits
                    </Button>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
