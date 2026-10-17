// Wire types for backend/api's JSON responses — kept in step with the Go structs they mirror
// (named in each comment), not generated from them.

export type RaceMode = 'solo' | 'multiplayer' | 'daily'

// [msSinceStart, typedLength, rejected] — see backend/api/replays.go's replayEvent.
export type ReplayEvent = [number, number, 0 | 1]

export interface ReplayData {
  passage: string
  events: Array<ReplayEvent>
}

// users.go RaceResult
export interface ApiRace {
  id: number
  date: string
  mode: RaceMode
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
  hasReplay: boolean
  // Only on the POST response: what this race paid, and achievements it newly unlocked.
  coinsEarned?: number
  achievements?: Array<{ id: string; reward: number }>
}

// users.go ProfileStats
export interface ApiStats {
  racesPlayed: number
  bestWpm: number
  avgWpm: number
  avgAccuracy: number
  wins: number
}

// users.go UserProfile
export interface ApiProfile {
  id: string
  displayName: string
  email?: string
  avatarUrl?: string
  carModel: string
  underglow: boolean
  underglowColor: string
  trail: string
  equippedPowerup: string
  races: Array<ApiRace>
  stats: ApiStats
  coins: number
  // Paid shop items this player has bought (see #/lib/shop).
  owned: Array<string>
  // Ids of every achievement unlocked (and paid) so far.
  achievements: Array<string>
}

export interface ApiCosmetics {
  carModel: string
  underglow: boolean
  underglowColor: string
  trail: string
  equippedPowerup: string
}

// users.go raceRequest
export interface ApiRaceInput {
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
  mode: RaceMode
  passage?: string
  replay?: Array<ReplayEvent>
  dailyDate?: string
  // Hour (0-23) on the player's clock when they finished — for Early bird / Night owl.
  localHour?: number
  date?: string // import only
}

// daily.go DailyResult
export interface ApiDailyResult {
  date: string
  wpm: number
  accuracy: number
}

// leaderboard.go LeaderboardEntry / Leaderboard
export interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  avatarUrl?: string
  carModel: string
  wpm: number
  accuracy: number
  replayId: number | null
  isMe: boolean
}

export interface Leaderboard {
  entries: Array<LeaderboardEntry>
  me: LeaderboardEntry | null
}

export type LeaderboardBoard = 'speed' | 'daily'
export type LeaderboardPeriod = 'day' | 'week' | 'all'
export type LeaderboardScope = 'global' | 'friends'

export interface LeaderboardQuery {
  board: LeaderboardBoard
  period?: LeaderboardPeriod
  scope?: LeaderboardScope
  date?: string
}

// friends.go Friend / FriendsResponse
export type FriendStatus = 'none' | 'friends' | 'incoming' | 'outgoing'

export interface Friend {
  id: string
  displayName: string
  avatarUrl?: string
  carModel: string
  bestWpm: number
  racesPlayed: number
  status: FriendStatus
}

export interface FriendsResponse {
  friends: Array<Friend>
  incoming: Array<Friend>
  outgoing: Array<Friend>
}

// replays.go Replay
export interface ApiReplay extends ReplayData {
  id: number
  date: string
  mode: RaceMode
  wpm: number
  accuracy: number
  placement: number
  racerCount: number
  displayName: string
  avatarUrl?: string
  carModel: string
}
