import { Fragment, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Lock } from '#/components/ui/icons'
import PixelIcon from '#/components/ui/PixelIcon'
import Coins from '#/components/ui/Coins'
import PixelMeter from '#/components/ui/PixelMeter'
import { Button } from '#/components/ui/button'
import { CardContent, CardHeader } from '#/components/ui/card'
import CarIcon, { VEHICLES } from '#/components/typing/CarIcon'
import RaceTrack, { Trail } from '#/components/typing/RaceTrack'
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

// The slot an item previews in: its id's prefix ("car:lambo" → "car"), or the whole id for
// one-offs like "underglow".
function previewSlot(itemId: string) {
  return itemId.split(':')[0]
}

// One purchase flow for every tile on the page. Clicking something you don't own previews it —
// one preview per slot, so a locked car, trail and neon can all be tried on together in the
// showroom — and offers "Buy for N?"; only that confirm actually spends coins.
function useShop() {
  const { coins, owns, buy } = useProfile()
  const [previews, setPreviews] = useState<Record<string, string | undefined>>(
    {},
  )
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function isPreviewing(itemId: string) {
    return previews[previewSlot(itemId)] === itemId
  }

  // Clicking a locked item previews it, or stops previewing it if it already was.
  function togglePreview(itemId: string) {
    const slot = previewSlot(itemId)
    setPreviews((prev) => ({
      ...prev,
      [slot]: prev[slot] === itemId ? undefined : itemId,
    }))
  }

  // Equipping something you own ends the preview in its slot.
  function endPreview(itemId: string) {
    const slot = previewSlot(itemId)
    setPreviews((prev) => ({ ...prev, [slot]: undefined }))
  }

  function clearPreviews() {
    setPreviews({})
  }

  async function purchase(itemId: string, thenEquip: () => void) {
    setBuying(itemId)
    setError(null)
    try {
      await buy(itemId)
      endPreview(itemId)
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

  return {
    coins,
    owns,
    previews,
    isPreviewing,
    togglePreview,
    endPreview,
    clearPreviews,
    buying,
    error,
    purchase,
  }
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
  const previewing = shop.isPreviewing(itemId)

  return (
    <div
      className={cn(
        'relative flex flex-col bg-card transition-colors hover:bg-accent',
        selected &&
          'bg-primary/10 shadow-[inset_0_0_0_2px_var(--color-primary)]',
        previewing && 'bg-[#2a1238] shadow-[inset_0_0_0_2px_#ff2fb4]',
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (owned) {
            shop.endPreview(itemId)
            onEquip()
          } else {
            shop.togglePreview(itemId)
          }
        }}
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
        ) : previewing ? (
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

  // Preview mode: every locked item being previewed goes on your car in the showroom, together,
  // before you spend anything.
  const previewCar = shop.previews.car?.slice('car:'.length)
  const previewTrail = shop.previews.trail?.slice('trail:'.length) as
    typeof trail | undefined
  const previewUnderglow = shop.previews[UNDERGLOW_ITEM] !== undefined
  const previewing = Boolean(previewCar || previewTrail || previewUnderglow)

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {/* One connected panel like the dashboard: the showroom on the left stays in view while
            you browse the shop on the right. */}
        <div className="rise-in px-corners grid flex-1 gap-[2px] border-2 border-border bg-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <aside className="bg-card">
            <div className="relative flex flex-col lg:sticky lg:top-0">
              {previewing && (
                <div className="absolute top-2 left-3 z-10 flex items-center gap-2">
                  <span className="race-announcer">Preview</span>
                  <button
                    type="button"
                    onClick={shop.clearPreviews}
                    className="race-announcer cursor-pointer hover:bg-[#2a1238]"
                  >
                    Clear
                  </button>
                </div>
              )}
              <RaceTrack
                racers={[
                  {
                    id: 'you',
                    name: 'You',
                    progress: 0.5,
                    wpm: 60,
                    isYou: true,
                    model: previewCar ?? carModel,
                    underglow: underglow || previewUnderglow,
                    underglowColor,
                    trail: previewTrail ?? trail,
                  },
                ]}
                phase="ready"
                finishLine={false}
                epic
                showcase
              />
              <div className="flex flex-col gap-4 p-5">
                <Coins amount={shop.coins} className="text-2xl text-signal" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="kicker">Car</dt>
                  <dd className="font-semibold">
                    {VEHICLES.find((v) => v.id === carModel)?.label ?? carModel}
                  </dd>
                  <dt className="kicker">Trail</dt>
                  <dd className="font-semibold">
                    {TRAILS.find((t) => t.id === trail)?.label}
                  </dd>
                  <dt className="kicker">Power-up</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <PixelIcon name={equippedPowerup} />
                    {POWERUPS.find((p) => p.id === equippedPowerup)?.label}
                  </dd>
                  <dt className="kicker">Underglow</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    {underglow ? (
                      <>
                        <span
                          className="px-corners size-3"
                          style={{ background: underglowColor }}
                        />
                        On
                      </>
                    ) : (
                      'Off'
                    )}
                  </dd>
                </dl>
                {shop.error && (
                  <p className="text-sm text-destructive">{shop.error}</p>
                )}
                <div className="glass-divider" />
                {/* How much of the shop you own, per category and overall. */}
                {(() => {
                  const groups = [
                    {
                      label: 'Cars',
                      ids: SORTED_CARS.map((v) => carItem(v.id)),
                    },
                    {
                      label: 'Trails',
                      ids: SORTED_TRAILS.map((t) => trailItem(t.id)),
                    },
                    {
                      label: 'Abilities',
                      ids: SORTED_POWERUPS.map((p) => powerupItem(p.id)),
                    },
                  ]
                  const all = [...groups.flatMap((g) => g.ids), UNDERGLOW_ITEM]
                  const ownedCount = all.filter((id) => shop.owns(id)).length
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-baseline justify-between">
                        <p className="kicker">Collection</p>
                        <span className="font-mono text-xs text-muted-foreground">
                          {ownedCount}/{all.length}
                        </span>
                      </div>
                      <PixelMeter
                        frac={ownedCount / all.length}
                        segments={20}
                        className="gap-[2px]"
                      />
                      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                        {groups.map((g) => (
                          <Fragment key={g.label}>
                            <dt className="text-muted-foreground">{g.label}</dt>
                            <dd className="font-mono text-xs">
                              {g.ids.filter((id) => shop.owns(id)).length}/
                              {g.ids.length}
                            </dd>
                          </Fragment>
                        ))}
                      </dl>
                    </div>
                  )
                })()}
              </div>
            </div>
          </aside>

          <div className="bg-card">
            <CardHeader className="py-5">
              <p className="kicker">Cars</p>
            </CardHeader>
            <CardContent className="pt-0 pb-8">
              <div className="px-corners grid border-2 border-border [&>*]:shadow-[0_0_0_1px_var(--color-border)] grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
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
              </div>
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
                    className="px-corners size-8 shrink-0 border-2 border-border"
                    style={{ backgroundColor: underglowColor }}
                  />
                  <span className="flex-1">
                    <p className="text-sm font-bold">Neon underglow</p>
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
                    className="px-corners size-8 shrink-0 border-2 border-border"
                    style={{ backgroundColor: underglowColor }}
                  />
                  <span className="flex-1">
                    <p className="text-sm font-bold">Neon underglow</p>
                  </span>
                </ShopTile>
              )}
              {((ownsUnderglow && underglow) || previewUnderglow) && (
                <div className="flex flex-wrap items-center gap-3 pl-1">
                  {CAR_COLORS.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={`${swatch.id} underglow`}
                      onClick={() => setUnderglowColor(swatch.value)}
                      className={cn(
                        'px-corners flex size-9 items-center justify-center border-2 transition-transform hover:scale-110',
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
                    className="px-corners relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground"
                    title="Custom color"
                  >
                    <input
                      type="color"
                      value={underglowColor}
                      onChange={(event) =>
                        setUnderglowColor(event.target.value)
                      }
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
            <CardContent className="pt-0 pb-8">
              <div className="px-corners grid border-2 border-border [&>*]:shadow-[0_0_0_1px_var(--color-border)] grid-cols-2 sm:grid-cols-3">
                {SORTED_TRAILS.map((option) => (
                  <ShopTile
                    key={option.id}
                    shop={shop}
                    itemId={trailItem(option.id)}
                    selected={option.id === trail}
                    onEquip={() => setTrail(option.id)}
                    className="items-center gap-2 px-4 pt-4 pb-1 text-center"
                  >
                    {/* Live preview, not just a name: your own car on a strip of night road,
                        with the trail rendered exactly as it is mid-race (RaceTrack's Trail). */}
                    <div className="trail-preview">
                      <span className="race-car-wrap trail-preview-car">
                        <Trail variant={option.id} model={carModel} />
                        <CarIcon
                          model={carModel}
                          className="race-car-svg w-20"
                        />
                      </span>
                    </div>
                    <p className="text-sm font-bold">{option.label}</p>
                  </ShopTile>
                ))}
              </div>
            </CardContent>

            <div className="glass-divider" />

            <CardHeader className="py-5">
              <p className="kicker">Powerups</p>
            </CardHeader>
            <CardContent className="pt-0 pb-8">
              <div className="px-corners grid border-2 border-border [&>*]:shadow-[0_0_0_1px_var(--color-border)] grid-cols-1 sm:grid-cols-2">
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
              </div>
            </CardContent>
          </div>
        </div>
      </div>
    </main>
  )
}
