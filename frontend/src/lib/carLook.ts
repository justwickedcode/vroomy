import { CAR_MODELS } from '#/components/typing/CarIcon'
import { toTrailVariant } from '#/lib/trails'
import type { CarModel } from '#/components/typing/CarIcon'
import type { TrailVariant } from '#/lib/trails'

// How a car is dressed: the model, its underglow and its trail. The field names match
// RaceTrack's Racer (and CarIcon's props, bar `model`), so a look spreads straight onto either.
export interface CarLook {
  model: CarModel
  underglow: boolean
  underglowColor: string
  trail: TrailVariant
}

// Someone else's car as the api describes it (a leaderboard row, a friend, a replay).
export function lookFromApi(look: {
  carModel: string
  underglow: boolean
  underglowColor: string
  trail: string
}): CarLook {
  return {
    model: look.carModel,
    underglow: look.underglow,
    underglowColor: look.underglowColor,
    trail: toTrailVariant(look.trail),
  }
}

// A racer in a multiplayer room as backend/ws describes them: glow is the underglow colour, empty
// for none. A racer with no car of their own (a pace car, or an older client) gets one picked by
// lane, which every client agrees on; with no trail, RaceTrack hands out a bot one.
export function lookFromSeat(seat: {
  lane: number
  car?: string
  glow?: string
  trail?: string
}): Partial<CarLook> & { model: CarModel } {
  return {
    model: seat.car || CAR_MODELS[(seat.lane + 1) % CAR_MODELS.length].id,
    underglow: Boolean(seat.glow),
    underglowColor: seat.glow || undefined,
    trail: seat.trail ? toTrailVariant(seat.trail) : undefined,
  }
}
