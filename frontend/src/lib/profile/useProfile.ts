import { useCallback, useEffect, useState } from 'react'
import { UPGRADES, creditsForRace } from '#/lib/upgrades'
import type { CarModel } from '#/components/typing/CarIcon'
import type { LiveryId } from '#/lib/liveries'
import type { UpgradeSlot } from '#/lib/upgrades'

const STORAGE_KEY = 'vroomy:profile:v1'
const MAX_RACE_HISTORY = 50

export const CAR_COLORS = [
  { id: 'crimson', value: '#e11d48' },
  { id: 'amber', value: '#f59e0b' },
  { id: 'lime', value: '#65a30d' },
  { id: 'emerald', value: '#059669' },
  { id: 'sky', value: '#0284c7' },
  { id: 'indigo', value: '#4f46e5' },
  { id: 'violet', value: '#7c3aed' },
  { id: 'graphite', value: '#3b4252' },
] as const

const DEFAULT_COLOR: string = CAR_COLORS[0].value
const DEFAULT_MODEL: CarModel = 'sport'
const DEFAULT_LIVERY: LiveryId = 'solid'

export interface RaceRecord {
  id: string
  date: string
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
}

interface Profile {
  carModel: CarModel
  carColor: string
  // 'solid' (the default) is exactly today's plain-paint look — a profile saved before liveries
  // existed needs no migration, it just reads as 'solid'.
  carLivery: LiveryId
  races: Array<RaceRecord>
  // Lifetime race count, tracked separately from races.length: races itself is capped to
  // MAX_RACE_HISTORY so storage doesn't grow forever, which means races.length alone
  // permanently under-reports how many races a long-time player has actually run once they
  // pass that cap — and any achievement milestone past MAX_RACE_HISTORY would be silently
  // unreachable if racesPlayed were derived from it.
  racesPlayedTotal: number
  // Cosmetic-upgrade economy (see #/lib/upgrades): credits earned per race, which of them have
  // been bought, and which owned option is currently equipped in each slot. A slot absent from
  // equippedUpgrades (or an old profile with no upgrade data at all) just means the stock look
  // for that slot — no migration needed there either.
  credits: number
  ownedUpgrades: Array<string>
  equippedUpgrades: Partial<Record<UpgradeSlot, string>>
}

const DEFAULT_PROFILE: Profile = {
  carModel: DEFAULT_MODEL,
  carColor: DEFAULT_COLOR,
  carLivery: DEFAULT_LIVERY,
  races: [],
  racesPlayedTotal: 0,
  credits: 0,
  ownedUpgrades: [],
  equippedUpgrades: {},
}

function readProfile(): Profile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<Profile>
    const races = Array.isArray(parsed.races) ? parsed.races : []
    return {
      carModel: parsed.carModel ?? DEFAULT_MODEL,
      carColor: parsed.carColor ?? DEFAULT_COLOR,
      carLivery: parsed.carLivery ?? DEFAULT_LIVERY,
      races,
      // A profile saved before racesPlayedTotal existed has no lifetime count on record —
      // races.length is the best available floor for it (never an overcount, since the total
      // can only be >= how many are currently retained).
      racesPlayedTotal: parsed.racesPlayedTotal ?? races.length,
      credits: parsed.credits ?? 0,
      ownedUpgrades: Array.isArray(parsed.ownedUpgrades)
        ? parsed.ownedUpgrades
        : [],
      equippedUpgrades:
        parsed.equippedUpgrades && typeof parsed.equippedUpgrades === 'object'
          ? parsed.equippedUpgrades
          : {},
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

function writeProfile(profile: Profile) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — the
    // in-memory state still works for the current session, it just won't
    // persist across reloads.
  }
}

export interface ProfileStats {
  racesPlayed: number
  bestWpm: number
  avgWpm: number
  avgAccuracy: number
  wins: number
}

// bestWpm/avgWpm/avgAccuracy/wins are computed only from the retained (capped) races window —
// a rolling recent-history sample, same as before. racesPlayed is the one exception: it's the
// true lifetime count (see Profile.racesPlayedTotal) so long-run milestones stay reachable past
// the retention cap.
function computeStats(
  races: Array<RaceRecord>,
  racesPlayedTotal: number,
): ProfileStats {
  if (races.length === 0) {
    return {
      racesPlayed: racesPlayedTotal,
      bestWpm: 0,
      avgWpm: 0,
      avgAccuracy: 0,
      wins: 0,
    }
  }
  const bestWpm = Math.max(...races.map((r) => r.wpm))
  const avgWpm = Math.round(
    races.reduce((sum, r) => sum + r.wpm, 0) / races.length,
  )
  const avgAccuracy = Math.round(
    races.reduce((sum, r) => sum + r.accuracy, 0) / races.length,
  )
  const wins = races.filter((r) => r.placement === 1).length
  return { racesPlayed: racesPlayedTotal, bestWpm, avgWpm, avgAccuracy, wins }
}

export function useProfile() {
  // Starts from the SSR-safe default and syncs from localStorage right
  // after mount — a one-frame flash of "no history yet" is an acceptable
  // trade-off for not hand-rolling hydration-safe localStorage reads.
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setProfile(readProfile())
    setHydrated(true)
  }, [])

  const setCarModel = useCallback((carModel: CarModel) => {
    setProfile((prev) => {
      const next = { ...prev, carModel }
      writeProfile(next)
      return next
    })
  }, [])

  const setCarColor = useCallback((carColor: string) => {
    setProfile((prev) => {
      const next = { ...prev, carColor }
      writeProfile(next)
      return next
    })
  }, [])

  const setCarLivery = useCallback((carLivery: LiveryId) => {
    setProfile((prev) => {
      const next = { ...prev, carLivery }
      writeProfile(next)
      return next
    })
  }, [])

  const addRace = useCallback((race: Omit<RaceRecord, 'id' | 'date'>) => {
    setProfile((prev) => {
      const record: RaceRecord = {
        ...race,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
      }
      const races = [record, ...prev.races].slice(0, MAX_RACE_HISTORY)
      const next = {
        ...prev,
        races,
        racesPlayedTotal: prev.racesPlayedTotal + 1,
        credits: prev.credits + creditsForRace(race.wpm, race.placement),
      }
      writeProfile(next)
      return next
    })
  }, [])

  // Buys and immediately equips an upgrade — refuses silently (no state change) if it's already
  // owned or the player can't afford it, so callers don't need their own affordability check
  // before calling this; the shop UI just disables the button using the same stats it already
  // has (credits, ownedUpgrades).
  const buyUpgrade = useCallback((upgradeId: string) => {
    setProfile((prev) => {
      const option = UPGRADES.find((u) => u.id === upgradeId)
      if (!option) return prev
      if (prev.ownedUpgrades.includes(upgradeId)) return prev
      if (prev.credits < option.cost) return prev
      const next = {
        ...prev,
        credits: prev.credits - option.cost,
        ownedUpgrades: [...prev.ownedUpgrades, upgradeId],
        equippedUpgrades: {
          ...prev.equippedUpgrades,
          [option.slot]: upgradeId,
        },
      }
      writeProfile(next)
      return next
    })
  }, [])

  // Swaps which already-owned option (if any) is active in a slot — pass null to unequip
  // (back to that slot's stock look) rather than trading it in for a different owned tier.
  const equipUpgrade = useCallback(
    (slot: UpgradeSlot, upgradeId: string | null) => {
      setProfile((prev) => {
        if (upgradeId !== null && !prev.ownedUpgrades.includes(upgradeId)) {
          return prev
        }
        const equippedUpgrades = { ...prev.equippedUpgrades }
        if (upgradeId === null) delete equippedUpgrades[slot]
        else equippedUpgrades[slot] = upgradeId
        const next = { ...prev, equippedUpgrades }
        writeProfile(next)
        return next
      })
    },
    [],
  )

  return {
    hydrated,
    carModel: profile.carModel,
    carColor: profile.carColor,
    carLivery: profile.carLivery,
    races: profile.races,
    stats: computeStats(profile.races, profile.racesPlayedTotal),
    credits: profile.credits,
    ownedUpgrades: profile.ownedUpgrades,
    equippedUpgrades: profile.equippedUpgrades,
    setCarModel,
    setCarColor,
    setCarLivery,
    addRace,
    buyUpgrade,
    equipUpgrade,
  }
}
