// A guest's daily-challenge results, in localStorage. Logged-in players' results live
// server-side (backend/api's daily_results); these are uploaded on first login (see
// importGuestData in useProfile) and then cleared.

const STORAGE_KEY = 'vroomy:daily:v1'

export interface DailyResult {
  wpm: number
  accuracy: number
}

export type DailyResults = Record<string, DailyResult>

export function readLocalDaily(): DailyResults {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as DailyResults) : {}
  } catch {
    return {}
  }
}

export function writeLocalDaily(all: DailyResults) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage unavailable — history just won't persist across reloads.
  }
}

export function clearLocalDaily() {
  writeLocalDaily({})
}
