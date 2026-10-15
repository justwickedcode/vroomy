import type { ReplayData } from '#/lib/api/types'

// Guest replays, keyed by the local RaceRecord id they belong to (see useProfile). Logged-in
// players' replays live server-side instead; these are uploaded with the rest of a guest's
// history on first login (see importGuestData) and then cleared.

const STORAGE_KEY = 'vroomy:replays:v1'
// A replay is a few KB; this keeps localStorage use small while still covering a session's
// worth of races.
const MAX_LOCAL_REPLAYS = 20

type ReplayStore = Record<string, ReplayData | undefined>

function readStore(): ReplayStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as ReplayStore) : {}
  } catch {
    return {}
  }
}

function writeStore(store: ReplayStore) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Quota or private mode — the replay just isn't kept.
  }
}

// keepIds is the race ids still in the local history (newest first); anything else is pruned
// so replays never outlive the race they belong to.
export function saveLocalReplay(
  raceId: string,
  replay: ReplayData,
  keepIds: Array<string>,
) {
  const store = readStore()
  store[raceId] = replay
  const kept = new Set(
    [raceId, ...keepIds].filter((id) => store[id]).slice(0, MAX_LOCAL_REPLAYS),
  )
  writeStore(
    Object.fromEntries(Object.entries(store).filter(([id]) => kept.has(id))),
  )
}

export function getLocalReplay(raceId: string): ReplayData | null {
  return readStore()[raceId] ?? null
}

export function clearLocalReplays() {
  writeStore({})
}
