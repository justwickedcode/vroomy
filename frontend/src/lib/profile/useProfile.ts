import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'
import {
  getMyProfileFn,
  importDailyFn,
  importRacesFn,
  postRaceFn,
  purchaseFn,
  putCosmeticsFn,
} from '#/lib/api/functions'
import {
  UNDERGLOW_ITEM,
  carItem,
  coinsForRace,
  ownsItem,
  powerupItem,
  priceOf,
  trailItem,
} from '#/lib/shop'
import {
  clearLocalReplays,
  getLocalReplay,
  saveLocalReplay,
} from '#/lib/replay/localReplays'
import { clearLocalDaily, readLocalDaily } from '#/lib/daily/localDaily'
import { ACHIEVEMENTS, achievementReward } from '#/lib/achievements'
import type {
  ApiCosmetics,
  ApiProfile,
  ApiRace,
  ApiRaceInput,
  ApiStats,
  RaceMode,
  ReplayData,
} from '#/lib/api/types'
import type { CarModel } from '#/components/typing/CarIcon'
import { toTrailVariant } from '#/lib/trails'
import type { TrailVariant } from '#/lib/trails'
import { asPowerup } from '#/lib/powerups'
import type { PowerupKind } from '#/lib/powerups'

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

const DEFAULT_MODEL: CarModel = 'sport'
const DEFAULT_TRAIL: TrailVariant = 'nitro'
const DEFAULT_UNDERGLOW_COLOR: string = CAR_COLORS[4].value
const DEFAULT_POWERUP: PowerupKind = 'boost'

export interface RaceRecord {
  id: string
  date: string
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
  // Absent on races saved before modes/replays existed.
  mode?: RaceMode
  hasReplay?: boolean
}

export interface UnlockedAchievement {
  id: string
  title: string
  reward: number
}

export interface SavedRace {
  replayId: string | null
  coinsEarned: number
  // Achievements this race newly unlocked; their rewards are paid on top of coinsEarned.
  achievements: Array<UnlockedAchievement>
}

export interface NewRace {
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
  mode: RaceMode
  replay?: ReplayData | null
  // The player's local date, for a mode "daily" race — the server also records it as that
  // day's daily-challenge result (see backend/api's handlePostRace).
  dailyDate?: string
}

interface Profile {
  carModel: CarModel
  // Underglow is bought once in the garage, then free to toggle and recolor. Cars otherwise
  // render in their own sprite's native paint — color is reserved for underglow.
  underglow: boolean
  underglowColor: string
  // Which trail effect (see #/lib/trails) renders behind the player's own car in a race.
  trail: TrailVariant
  // Which powerup (see #/lib/powerups) the player gets once per solo race — 'boost' is free, so
  // it's always a safe fallback.
  equippedPowerup: PowerupKind
  // Shop balance and the paid items bought with it (see #/lib/shop).
  coins: number
  owned: Array<string>
  // Achievements already paid for (see payAchievements).
  achievementsClaimed: Array<string>
  races: Array<RaceRecord>
  // Lifetime race count, tracked separately from races.length: races itself is capped to
  // MAX_RACE_HISTORY so storage doesn't grow forever, which means races.length alone
  // permanently under-reports how many races a long-time player has actually run once they
  // pass that cap — and any achievement milestone past MAX_RACE_HISTORY would be silently
  // unreachable if racesPlayed were derived from it.
  racesPlayedTotal: number
}

const DEFAULT_PROFILE: Profile = {
  carModel: DEFAULT_MODEL,
  underglow: false,
  underglowColor: DEFAULT_UNDERGLOW_COLOR,
  trail: DEFAULT_TRAIL,
  equippedPowerup: DEFAULT_POWERUP,
  races: [],
  racesPlayedTotal: 0,
  coins: 0,
  owned: [],
  achievementsClaimed: [],
}

// The paid items a profile has equipped — what a save from before the shop existed gets to keep,
// since everything was unlocked back then.
function equippedPaidItems(
  p: Pick<Profile, 'carModel' | 'trail' | 'equippedPowerup' | 'underglow'>,
) {
  return [
    carItem(p.carModel),
    trailItem(p.trail),
    powerupItem(p.equippedPowerup),
    ...(p.underglow ? [UNDERGLOW_ITEM] : []),
  ].filter((id) => priceOf(id) > 0)
}

function readProfile(): Profile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<Profile>
    const races = Array.isArray(parsed.races) ? parsed.races : []
    const cosmetics = {
      carModel: parsed.carModel ?? DEFAULT_MODEL,
      underglow: parsed.underglow ?? false,
      underglowColor: parsed.underglowColor ?? DEFAULT_UNDERGLOW_COLOR,
      trail: toTrailVariant(parsed.trail ?? DEFAULT_TRAIL),
      equippedPowerup: asPowerup(parsed.equippedPowerup),
    }
    const profile: Profile = {
      ...cosmetics,
      // A save from before the shop gets paid for the races it still has on record, and keeps
      // whatever it had equipped.
      coins:
        parsed.coins ??
        races.reduce((sum, race) => sum + coinsForRace(race), 0),
      owned: Array.isArray(parsed.owned)
        ? parsed.owned
        : equippedPaidItems(cosmetics),
      achievementsClaimed: Array.isArray(parsed.achievementsClaimed)
        ? parsed.achievementsClaimed
        : [],
      races,
      // A profile saved before racesPlayedTotal existed has no lifetime count on record —
      // races.length is the best available floor for it (never an overcount, since the total
      // can only be >= how many are currently retained).
      racesPlayedTotal: parsed.racesPlayedTotal ?? races.length,
    }
    // A save from before achievements paid out gets paid for everything it has already unlocked.
    return Array.isArray(parsed.achievementsClaimed)
      ? profile
      : payAchievements(profile).profile
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

// Pays a guest for every achievement their history now satisfies that hasn't been paid yet —
// the browser-side twin of backend/api's syncAchievements.
function payAchievements(profile: Profile): {
  profile: Profile
  unlocked: Array<UnlockedAchievement>
} {
  const stats = computeStats(profile.races, profile.racesPlayedTotal)
  const unlocked = ACHIEVEMENTS.filter(
    (a) =>
      !profile.achievementsClaimed.includes(a.id) &&
      a.unlocked(stats, profile.races),
  ).map((a) => ({ id: a.id, title: a.title, reward: achievementReward(a.id) }))
  if (unlocked.length === 0) return { profile, unlocked }
  return {
    profile: {
      ...profile,
      coins: profile.coins + unlocked.reduce((sum, a) => sum + a.reward, 0),
      achievementsClaimed: [
        ...profile.achievementsClaimed,
        ...unlocked.map((a) => a.id),
      ],
    },
    unlocked,
  }
}

// One shared copy of the guest profile for the whole page. Every component calls useProfile, and
// each used to keep its own copy in React state — so a change made through one (buying a car)
// could be overwritten moments later when another, stale copy saved itself (equipping it), which
// undid the purchase. Now every instance reads and writes this single store.
let localCache: Profile | null = null
const localListeners = new Set<() => void>()

function getLocalProfile(): Profile {
  localCache ??= readProfile()
  return localCache
}

function updateLocalProfile(updater: (prev: Profile) => Profile) {
  const next = updater(getLocalProfile())
  localCache = next
  writeProfile(next)
  for (const listener of localListeners) listener()
}

function subscribeLocalProfile(listener: () => void) {
  localListeners.add(listener)
  return () => {
    localListeners.delete(listener)
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

// --- Logged-in players: backend/api is the source of truth ---

export const profileQueryKey = (userId: string | null) =>
  ['profile', userId] as const

type Cosmetics = Pick<
  Profile,
  'carModel' | 'underglow' | 'underglowColor' | 'trail' | 'equippedPowerup'
>

function cosmeticsOf(p: Cosmetics | ApiProfile): ApiCosmetics {
  return {
    carModel: p.carModel,
    underglow: p.underglow,
    underglowColor: p.underglowColor,
    trail: p.trail,
    equippedPowerup: p.equippedPowerup,
  }
}

function raceFromApi(race: ApiRace): RaceRecord {
  return { ...race, id: String(race.id) }
}

function raceInput(race: NewRace): ApiRaceInput {
  return {
    wpm: race.wpm,
    accuracy: race.accuracy,
    placement: race.placement,
    racerCount: race.racerCount,
    mode: race.mode,
    passage: race.replay?.passage,
    replay: race.replay?.events,
    dailyDate: race.dailyDate,
    localHour: new Date().getHours(),
  }
}

// The server recomputes lifetime stats on every GET; this only bridges the moment between a
// race finishing and that refetch landing, so the UI never shows a stale best/average.
function statsWithRace(stats: ApiStats, race: NewRace): ApiStats {
  const n = stats.racesPlayed
  return {
    racesPlayed: n + 1,
    bestWpm: Math.max(stats.bestWpm, race.wpm),
    avgWpm: Math.round((stats.avgWpm * n + race.wpm) / (n + 1)),
    avgAccuracy: Math.round((stats.avgAccuracy * n + race.accuracy) / (n + 1)),
    wins: stats.wins + (race.placement === 1 ? 1 : 0),
  }
}

function isDefaultCosmetics(c: ApiCosmetics): boolean {
  return (
    c.carModel === DEFAULT_MODEL &&
    !c.underglow &&
    c.underglowColor === DEFAULT_UNDERGLOW_COLOR &&
    c.trail === DEFAULT_TRAIL &&
    c.equippedPowerup === DEFAULT_POWERUP
  )
}

// Validated locally before upload: api rejects a whole import batch for one bad entry, and a
// guest history written by an older build could contain anything.
function isImportable(r: RaceRecord): boolean {
  return (
    r.wpm >= 0 &&
    r.wpm <= 500 &&
    r.accuracy >= 0 &&
    r.accuracy <= 100 &&
    r.racerCount >= 1 &&
    r.racerCount <= 64 &&
    r.placement >= 1 &&
    r.placement <= r.racerCount
  )
}

const importedFlagKey = (userId: string) => `vroomy:imported:${userId}`
const importsInFlight = new Set<string>()

// importGuestData runs once per account per browser, the first time a player is seen logged in:
// it uploads whatever they played as a guest (races with their replays, daily results, and
// cosmetics if the account still has the defaults) and then clears the local copies, so the
// same guest history can't be imported into a second account later. Several components mount
// useProfile at once, hence the in-flight guard.
async function importGuestData(userId: string, queryClient: QueryClient) {
  if (typeof window === 'undefined' || importsInFlight.has(userId)) return
  try {
    if (window.localStorage.getItem(importedFlagKey(userId))) return
  } catch {
    return
  }
  importsInFlight.add(userId)

  try {
    const local = getLocalProfile()
    const races = local.races.filter(isImportable).map((r) => {
      const replay = r.hasReplay ? getLocalReplay(r.id) : null
      return {
        wpm: r.wpm,
        accuracy: r.accuracy,
        placement: r.placement,
        racerCount: r.racerCount,
        mode: r.mode ?? 'solo',
        date: r.date,
        localHour: new Date(r.date).getHours(),
        passage: replay?.passage,
        replay: replay?.events,
      } satisfies ApiRaceInput
    })
    if (races.length > 0) {
      try {
        await importRacesFn({ data: races })
      } catch {
        // A malformed replay is the likeliest culprit — the races themselves are still worth
        // keeping without it.
        await importRacesFn({
          data: races.map(({ passage: _p, replay: _r, ...rest }) => rest),
        })
      }
    }

    const daily = Object.entries(readLocalDaily())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 60)
      .map(([date, r]) => ({ date, wpm: r.wpm, accuracy: r.accuracy }))
    if (daily.length > 0) await importDailyFn({ data: daily })

    const remote = queryClient.getQueryData<ApiProfile>(profileQueryKey(userId))
    const localCosmetics = cosmeticsOf(local)
    if (
      remote &&
      isDefaultCosmetics(cosmeticsOf(remote)) &&
      !isDefaultCosmetics(localCosmetics)
    ) {
      await putCosmeticsFn({ data: localCosmetics })
    }

    // Races imported above paid out server-side; spend that on whatever the guest had bought, so
    // the garage looks the same after logging in. The guest's local balance itself is never
    // uploaded — it lives in localStorage, where anyone can edit it.
    const toBuy = [...local.owned].sort((a, b) => priceOf(a) - priceOf(b))
    for (const itemId of toBuy) {
      try {
        await purchaseFn({ data: itemId })
      } catch {
        // Already owned on the account, or not enough coins — skip it.
      }
    }

    window.localStorage.setItem(importedFlagKey(userId), '1')
    updateLocalProfile((prev) => ({
      ...prev,
      races: [],
      racesPlayedTotal: 0,
      coins: 0,
      owned: [],
    }))
    clearLocalReplays()
    clearLocalDaily()
    await queryClient.invalidateQueries({ queryKey: ['profile'] })
    await queryClient.invalidateQueries({ queryKey: ['daily'] })
  } catch (err) {
    // Left unflagged, so the next page load tries again.
    console.warn('Could not import guest history:', err)
  } finally {
    importsInFlight.delete(userId)
  }
}

export function useProfile() {
  const { user, loaded: userLoaded } = useCurrentUser()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  // The server render (and hydration) uses the default profile; the browser's saved one takes
  // over right after — a one-frame flash of "no history yet" rather than a hydration mismatch.
  const local = useSyncExternalStore(
    subscribeLocalProfile,
    getLocalProfile,
    () => DEFAULT_PROFILE,
  )
  const [localHydrated, setLocalHydrated] = useState(false)

  useEffect(() => {
    setLocalHydrated(true)
  }, [])

  const remoteQuery = useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: () => getMyProfileFn(),
    enabled: userId !== null,
    staleTime: 30_000,
  })
  // Logged in and api answered: the server is the source of truth. Logged out — or api is down —
  // the player still gets a working game on localStorage.
  const remote = userId !== null ? (remoteQuery.data ?? null) : null

  useEffect(() => {
    if (userId && remoteQuery.isSuccess) {
      void importGuestData(userId, queryClient)
    }
  }, [userId, remoteQuery.isSuccess, queryClient])

  const hydrated =
    userLoaded && localHydrated && (userId === null || !remoteQuery.isPending)

  const updateCosmetics = useCallback(
    (patch: Partial<Cosmetics>) => {
      const key = profileQueryKey(userId)
      const current = userId
        ? queryClient.getQueryData<ApiProfile>(key)
        : undefined
      if (current) {
        const next = { ...current, ...patch }
        queryClient.setQueryData(key, next)
        putCosmeticsFn({ data: cosmeticsOf(next) })
          .then((saved) => queryClient.setQueryData(key, saved))
          .catch(() => queryClient.invalidateQueries({ queryKey: key }))
        return
      }
      updateLocalProfile((prev) => ({ ...prev, ...patch }))
    },
    [userId, queryClient],
  )

  const setCarModel = useCallback(
    (carModel: CarModel) => updateCosmetics({ carModel }),
    [updateCosmetics],
  )
  const setUnderglow = useCallback(
    (underglow: boolean) => updateCosmetics({ underglow }),
    [updateCosmetics],
  )
  const setUnderglowColor = useCallback(
    (underglowColor: string) => updateCosmetics({ underglowColor }),
    [updateCosmetics],
  )
  const setTrail = useCallback(
    (trail: TrailVariant) => updateCosmetics({ trail }),
    [updateCosmetics],
  )
  const setEquippedPowerup = useCallback(
    (equippedPowerup: PowerupKind) => updateCosmetics({ equippedPowerup }),
    [updateCosmetics],
  )

  // Returns the new record's id (so the caller can link to its replay) and any achievements it
  // unlocked.
  const addLocalRace = useCallback(
    (race: NewRace): { id: string; unlocked: Array<UnlockedAchievement> } => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      let unlocked: Array<UnlockedAchievement> = []
      updateLocalProfile((prev) => {
        const record: RaceRecord = {
          id,
          date: new Date().toISOString(),
          wpm: race.wpm,
          accuracy: race.accuracy,
          placement: race.placement,
          racerCount: race.racerCount,
          mode: race.mode,
          hasReplay: Boolean(race.replay),
        }
        const races = [record, ...prev.races].slice(0, MAX_RACE_HISTORY)
        if (race.replay) {
          saveLocalReplay(
            record.id,
            race.replay,
            races.map((r) => r.id),
          )
        }
        const next = {
          ...prev,
          races,
          racesPlayedTotal: prev.racesPlayedTotal + 1,
          coins: prev.coins + coinsForRace(race),
        }
        const paid = payAchievements(next)
        unlocked = paid.unlocked
        return paid.profile
      })
      return { id, unlocked }
    },
    [],
  )

  // Resolves once the race is saved: the id to open its replay with (/replays/$replayId, null
  // when there's no replay) and the coins it paid — for the finish screen.
  const addRace = useCallback(
    (race: NewRace): Promise<SavedRace> => {
      const key = profileQueryKey(userId)
      const coinsEarned = coinsForRace(race)
      if (!userId || !queryClient.getQueryData(key)) {
        const { id, unlocked } = addLocalRace(race)
        return Promise.resolve({
          replayId: race.replay ? id : null,
          coinsEarned,
          achievements: unlocked,
        })
      }

      // Optimistic: the race shows up in history and stats immediately, and the refetch after
      // the POST swaps in the server's real row (with its real id, for replay links).
      const pending: ApiRace = {
        id: -Date.now(),
        date: new Date().toISOString(),
        mode: race.mode,
        wpm: race.wpm,
        accuracy: race.accuracy,
        placement: race.placement,
        racerCount: race.racerCount,
        hasReplay: false,
      }
      queryClient.setQueryData<ApiProfile>(key, (prev) =>
        prev
          ? {
              ...prev,
              races: [pending, ...prev.races].slice(0, MAX_RACE_HISTORY),
              stats: statsWithRace(prev.stats, race),
              coins: prev.coins + coinsEarned,
            }
          : prev,
      )

      return postRaceFn({ data: raceInput(race) })
        .then((saved) => ({
          replayId: saved.hasReplay ? String(saved.id) : null,
          coinsEarned: saved.coinsEarned ?? coinsEarned,
          achievements: (saved.achievements ?? []).map((a) => ({
            ...a,
            title: ACHIEVEMENTS.find((def) => def.id === a.id)?.title ?? a.id,
          })),
        }))
        .catch((err: unknown) => {
          // Don't lose the race if api is unreachable — keep it as guest history, which gets
          // imported once api is back (the import flag is already set, so clear it).
          console.warn('Could not save race to your account:', err)
          try {
            window.localStorage.removeItem(importedFlagKey(userId))
          } catch {
            // Nothing to clear.
          }
          const { id, unlocked } = addLocalRace(race)
          return {
            replayId: race.replay ? id : null,
            coinsEarned,
            achievements: unlocked,
          }
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: key })
          void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
          if (race.mode === 'daily') {
            void queryClient.invalidateQueries({ queryKey: ['daily'] })
          }
        })
    },
    [userId, queryClient, addLocalRace],
  )

  // Buys a shop item. Rejects (with a message fit to show) when it can't be bought.
  const buy = useCallback(
    async (itemId: string): Promise<void> => {
      const key = profileQueryKey(userId)
      if (userId && queryClient.getQueryData(key)) {
        const updated = await purchaseFn({ data: itemId })
        queryClient.setQueryData(key, updated)
        return
      }
      const current = getLocalProfile()
      const price = priceOf(itemId)
      if (ownsItem(current.owned, itemId)) return
      if (current.coins < price) throw new Error('Not enough coins')
      updateLocalProfile((prev) => ({
        ...prev,
        coins: prev.coins - price,
        owned: [...prev.owned, itemId],
      }))
    },
    [userId, queryClient],
  )

  const profile: Profile = remote
    ? {
        carModel: remote.carModel,
        underglow: remote.underglow,
        underglowColor: remote.underglowColor,
        trail: toTrailVariant(remote.trail),
        equippedPowerup: asPowerup(remote.equippedPowerup),
        races: remote.races.map(raceFromApi),
        racesPlayedTotal: remote.stats.racesPlayed,
        coins: remote.coins,
        owned: remote.owned,
        achievementsClaimed: remote.achievements,
      }
    : local

  return {
    hydrated,
    // True when history lives on the server (logged in, api reachable) — replay ids are then
    // server ids, not local ones.
    synced: remote !== null,
    carModel: profile.carModel,
    underglow: profile.underglow,
    underglowColor: profile.underglowColor,
    trail: profile.trail,
    equippedPowerup: profile.equippedPowerup,
    races: profile.races,
    stats: remote
      ? remote.stats
      : computeStats(profile.races, profile.racesPlayedTotal),
    setCarModel,
    setUnderglow,
    setUnderglowColor,
    setTrail,
    setEquippedPowerup,
    addRace,
    coins: profile.coins,
    // Ids of unlocked achievements — the server's record when logged in.
    achievements: profile.achievementsClaimed,
    owns: (itemId: string) => ownsItem(profile.owned, itemId),
    buy,
  }
}
