import { useCallback, useEffect, useState } from 'react'
import type { CarModel } from '#/components/typing/CarIcon'

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
  races: Array<RaceRecord>
}

const DEFAULT_PROFILE: Profile = {
  carModel: DEFAULT_MODEL,
  carColor: DEFAULT_COLOR,
  races: [],
}

function readProfile(): Profile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      carModel: parsed.carModel ?? DEFAULT_MODEL,
      carColor: parsed.carColor ?? DEFAULT_COLOR,
      races: Array.isArray(parsed.races) ? parsed.races : [],
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

function computeStats(races: Array<RaceRecord>): ProfileStats {
  if (races.length === 0) {
    return { racesPlayed: 0, bestWpm: 0, avgWpm: 0, avgAccuracy: 0, wins: 0 }
  }
  const bestWpm = Math.max(...races.map((r) => r.wpm))
  const avgWpm = Math.round(
    races.reduce((sum, r) => sum + r.wpm, 0) / races.length,
  )
  const avgAccuracy = Math.round(
    races.reduce((sum, r) => sum + r.accuracy, 0) / races.length,
  )
  const wins = races.filter((r) => r.placement === 1).length
  return { racesPlayed: races.length, bestWpm, avgWpm, avgAccuracy, wins }
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

  const addRace = useCallback((race: Omit<RaceRecord, 'id' | 'date'>) => {
    setProfile((prev) => {
      const record: RaceRecord = {
        ...race,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
      }
      const races = [record, ...prev.races].slice(0, MAX_RACE_HISTORY)
      const next = { ...prev, races }
      writeProfile(next)
      return next
    })
  }, [])

  return {
    hydrated,
    carModel: profile.carModel,
    carColor: profile.carColor,
    races: profile.races,
    stats: computeStats(profile.races),
    setCarModel,
    setCarColor,
    addRace,
  }
}
