import PRICES from './prices.json'
import type { RaceMode } from '#/lib/api/types'

// The garage shop. Every car, trail and powerup (and underglow) has a price in coins; one
// starter of each kind is free. Item ids are namespaced: "car:lambo", "trail:smoke",
// "powerup:nuke", "underglow".
//
// prices.json has an identical copy in backend/api (shop_prices.json), which is what purchases
// are actually charged from; a Go test fails if the two differ.

export type ShopItemId = keyof typeof PRICES

export const carItem = (model: string) => `car:${model}`
export const trailItem = (trail: string) => `trail:${trail}`
export const powerupItem = (powerup: string) => `powerup:${powerup}`
export const UNDERGLOW_ITEM = 'underglow'

// 0 for free items, and for ids the catalog doesn't know (nothing to buy).
export function priceOf(itemId: string): number {
  return (PRICES as Record<string, number | undefined>)[itemId] ?? 0
}

export function ownsItem(owned: ReadonlyArray<string>, itemId: string) {
  return priceOf(itemId) === 0 || owned.includes(itemId)
}

// Mirrors backend/api/shop.go's coinsForRace, which is what logged-in players are actually paid;
// this copy pays guests (in localStorage) and shows the number on the finish screen. 10 for
// finishing, a quarter of your WPM, a podium bonus when there was someone to beat, and a little
// extra for the daily challenge.
export function coinsForRace(race: {
  wpm: number
  placement: number
  racerCount: number
  mode?: RaceMode
}): number {
  let coins = 10 + Math.round(race.wpm / 4)
  if (race.racerCount > 1) {
    coins +=
      race.placement === 1
        ? 20
        : race.placement === 2
          ? 10
          : race.placement === 3
            ? 5
            : 0
  }
  if (race.mode === 'daily') coins += 15
  return coins
}

// Sort helper for the garage: cheapest first, ties alphabetical.
export function byPrice<T>(
  items: ReadonlyArray<T>,
  itemIdOf: (item: T) => string,
  labelOf: (item: T) => string,
): Array<T> {
  return [...items].sort(
    (a, b) =>
      priceOf(itemIdOf(a)) - priceOf(itemIdOf(b)) ||
      labelOf(a).localeCompare(labelOf(b)),
  )
}
