import Coins from '#/components/ui/Coins'
import { Award } from '#/components/ui/icons'
import type { UnlockedAchievement } from '#/lib/profile/useProfile'

// "Achievement unlocked: Speed demon +50" on a finish screen, one line per achievement the race
// just unlocked.
export default function AchievementUnlocks({
  unlocked,
}: {
  unlocked: Array<UnlockedAchievement>
}) {
  if (unlocked.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {unlocked.map((a) => (
        <p key={a.id} className="flex items-center gap-1.5 text-sm">
          <Award className="size-4" />
          <span className="text-muted-foreground">Achievement unlocked:</span>
          <strong>{a.title}</strong>
          <Coins amount={a.reward} prefix="+" className="text-signal" />
        </p>
      ))}
    </div>
  )
}
