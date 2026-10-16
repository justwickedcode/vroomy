import Coins from '#/components/ui/Coins'
import { Award, Medal, Sparkles, Trophy } from '#/components/ui/icons'
import { ordinal } from '#/lib/utils'
import type { ReactNode } from 'react'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'

const MEDAL_COLORS: Record<number, string> = {
  1: '#facc15',
  2: '#cbd5e1',
  3: '#c2703d',
}

function formatTime(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${seconds}`
}

// The finish screen, shown in place of the passage once you cross the line: where you placed on
// the left, what you won in the middle (one line per reward), and what to do next on the right.
// The speed, accuracy and time are already on the console's LCD right below, so they aren't
// repeated here.
export default function RaceResults({
  place,
  racerCount,
  elapsedMs,
  coinsEarned,
  newBest,
  unlocks,
  actions,
}: {
  place: number | null
  racerCount: number
  elapsedMs: number
  coinsEarned: number | null
  newBest?: boolean
  unlocks: Array<UnlockedAchievement>
  actions: ReactNode
}) {
  const medal = place !== null ? MEDAL_COLORS[place] : undefined
  const hasLoot = coinsEarned !== null || newBest || unlocks.length > 0
  return (
    <div className="race-results">
      <div className="flex items-center gap-4">
        {medal ? (
          <Medal className="size-14 shrink-0" style={{ color: medal }} />
        ) : (
          <Trophy className="size-14 shrink-0" />
        )}
        <div className="flex flex-col gap-1">
          <p
            className="font-display text-6xl leading-none uppercase [text-shadow:4px_4px_0_rgb(0_0_0/0.5)]"
            style={medal ? { color: medal } : undefined}
          >
            {place !== null ? ordinal(place) : 'Done'}
          </p>
          <p className="font-mono text-xs text-[#8a7ca3]">
            {racerCount > 1 && `of ${racerCount} · `}
            {formatTime(elapsedMs)}
          </p>
        </div>
      </div>

      {hasLoot ? (
        <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
          {coinsEarned !== null && (
            <li className="flex items-center gap-2">
              <Coins
                amount={coinsEarned}
                prefix="+"
                className="font-bold text-signal"
              />
            </li>
          )}
          {newBest && (
            <li className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4" />
              New best
            </li>
          )}
          {unlocks.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-2">
              <Award className="size-4" />
              <span className="truncate font-semibold">{a.title}</span>
              <Coins
                amount={a.reward}
                prefix="+"
                className="shrink-0 text-xs text-signal"
              />
            </li>
          ))}
        </ul>
      ) : (
        <span />
      )}

      <div className="flex flex-col gap-2">{actions}</div>
    </div>
  )
}
