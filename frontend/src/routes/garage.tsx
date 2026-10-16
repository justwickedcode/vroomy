import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Lock } from 'lucide-react'
import PixelIcon from '#/components/ui/PixelIcon'
import Coins from '#/components/ui/Coins'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CarIcon, { VEHICLES } from '#/components/typing/CarIcon'
import { Trail } from '#/components/typing/RaceTrack'
import { CAR_COLORS, useProfile } from '#/lib/profile/useProfile'
import { TRAILS } from '#/lib/trails'
import { POWERUPS } from '#/lib/powerups'
import {
  UNDERGLOW_ITEM,
  byPrice,
  carItem,
  powerupItem,
  priceOf,
  trailItem,
} from '#/lib/shop'
import { cn, handleTiltLeave, handleTiltMove } from '#/lib/utils'
import type { ReactNode } from 'react'

export const Route = createFileRoute('/garage')({ component: GaragePage })

const SORTED_CARS = byPrice(
  VEHICLES,
  (v) => carItem(v.id),
  (v) => v.label,
)
const SORTED_TRAILS = byPrice(
  TRAILS,
  (t) => trailItem(t.id),
  (t) => t.label,
)
const SORTED_POWERUPS = byPrice(
  POWERUPS,
  (p) => powerupItem(p.id),
  (p) => p.label,
)

// One purchase flow for every tile on the page: clicking something you don't own first asks
// "Buy for N?", and only the confirm actually spends coins — a single stray click never does.
function useShop() {
  const { coins, owns, buy } = useProfile()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function purchase(itemId: string, thenEquip: () => void) {
    setBuying(itemId)
    setError(null)
    try {
      await buy(itemId)
      setConfirming(null)
      thenEquip()
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "That didn't go through. Try again.",
      )
    } finally {
      setBuying(null)
    }
  }

  return { coins, owns, confirming, setConfirming, buying, error, purchase }
}

type Shop = ReturnType<typeof useShop>

// A garage item: owned ones equip on click; locked ones show their price, ask to confirm, then
// buy and equip in one go.
function ShopTile({
  shop,
  itemId,
  selected,
  onEquip,
  className,
  children,
}: {
  shop: Shop
  itemId: string
  selected: boolean
  onEquip: () => void
  className?: string
  children: ReactNode
}) {
  const owned = shop.owns(itemId)
  const price = priceOf(itemId)
  const affordable = shop.coins >= price
  const confirming = shop.confirming === itemId

  return (
    <div
      className={cn(
        'glass-chip relative flex flex-col rounded-xl transition-colors',
        selected && 'border-primary bg-primary/12',
        !owned && 'border-dashed',
      )}
    >
      <button
        type="button"
        onClick={() =>
          owned ? onEquip() : shop.setConfirming(confirming ? null : itemId)
        }
        onMouseMove={handleTiltMove}
        onMouseLeave={handleTiltLeave}
        className={cn('tilt-card flex flex-1 flex-col', className)}
      >
        <span className={cn('contents', !owned && '[&>*]:opacity-60')}>
          {children}
        </span>
      </button>
      <div className="flex items-center justify-center gap-1.5 px-2 pb-3 text-xs">
        {owned ? (
          selected ? (
            <span className="flex items-center gap-1 font-semibold text-primary">
              <Check className="size-3.5" />
              Equipped
            </span>
          ) : (
            <span className="text-muted-foreground">
              {price === 0 ? 'Free' : 'Owned'}
            </span>
          )
        ) : confirming ? (
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!affordable || shop.buying === itemId}
            onClick={() => void shop.purchase(itemId, onEquip)}
          >
            {affordable ? (
              <>
                Buy for <Coins amount={price} />
              </>
            ) : (
              `Need ${(price - shop.coins).toLocaleString()} more`
            )}
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Lock className="size-3" />
            <Coins amount={price} />
          </span>
        )}
      </div>
    </div>
  )
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
  const shop = useShop()
  const ownsUnderglow = shop.owns(UNDERGLOW_ITEM)

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <Coins amount={shop.coins} className="text-lg text-signal" />
              <p className="text-xs text-muted-foreground">
                Earn coins by finishing races — faster and higher placings pay
                more.
              </p>
            </div>
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
            {shop.error && (
              <p className="mb-2 text-sm text-destructive">{shop.error}</p>
            )}
          </CardContent>

          <div className="glass-divider" />
          <CardHeader className="py-5">
            <p className="kicker">Cars</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8 sm:grid-cols-3 lg:grid-cols-4">
            {SORTED_CARS.map((vehicle) => (
              <ShopTile
                key={vehicle.id}
                shop={shop}
                itemId={carItem(vehicle.id)}
                selected={vehicle.id === carModel}
                onEquip={() => setCarModel(vehicle.id)}
                className="speed-option items-center gap-2 pt-4 pb-1"
              >
                {/* Fixed-height slot so every label lines up, whatever the sprite's shape. */}
                <span className="flex h-14 items-center self-center">
                  <CarIcon model={vehicle.id} className="w-24" />
                </span>
                <span className="text-sm font-bold">{vehicle.label}</span>
              </ShopTile>
            ))}
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Underglow</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0 pb-8">
            {ownsUnderglow ? (
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
            ) : (
              <ShopTile
                shop={shop}
                itemId={UNDERGLOW_ITEM}
                selected={false}
                onEquip={() => setUnderglow(true)}
                className="flex-row items-center gap-4 p-4 text-left"
              >
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: underglowColor }}
                />
                <span className="flex-1">
                  <p className="text-sm font-bold">Neon underglow</p>
                  <p className="text-xs text-muted-foreground">
                    A glow under your car, in any color.
                  </p>
                </span>
              </ShopTile>
            )}
            {ownsUnderglow && underglow && (
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
          <CardContent className="grid grid-cols-2 gap-3 pt-0 pb-8 sm:grid-cols-3">
            {SORTED_TRAILS.map((option) => (
              <ShopTile
                key={option.id}
                shop={shop}
                itemId={trailItem(option.id)}
                selected={option.id === trail}
                onEquip={() => setTrail(option.id)}
                className="items-center gap-2 px-4 pt-4 pb-1 text-center"
              >
                {/* Live preview, not just a name — the trail is rendered exactly like it is
                    mid-race (see RaceTrack's Trail), anchored to a small dot standing in for
                    the car so the effect has something to trail off of. */}
                <div className="flex h-7 w-16 items-center justify-end self-center">
                  <span className="relative inline-block size-2 shrink-0 rounded-full bg-foreground/70">
                    <Trail variant={option.id} />
                  </span>
                </div>
                <p className="text-sm font-bold">{option.label}</p>
              </ShopTile>
            ))}
          </CardContent>

          <div className="glass-divider" />

          <CardHeader className="py-5">
            <p className="kicker">Powerups</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 pt-0 pb-8 sm:grid-cols-2">
            {SORTED_POWERUPS.map((option) => (
              <ShopTile
                key={option.id}
                shop={shop}
                itemId={powerupItem(option.id)}
                selected={option.id === equippedPowerup}
                onEquip={() => setEquippedPowerup(option.id)}
                className="flex-row items-center gap-3 px-4 pt-4 pb-1 text-left"
              >
                <PixelIcon name={option.id} className="size-8" />
                <span className="flex-1">
                  <p className="text-sm font-bold">{option.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.detail}
                  </p>
                </span>
              </ShopTile>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
