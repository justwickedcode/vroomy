import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { ACHIEVEMENTS } from '#/lib/achievements'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { Achievement, AchievementCategory } from '#/lib/achievements'

export const Route = createFileRoute('/achievements')({
  component: AchievementsPage,
})

// Declaration order in ACHIEVEMENTS is grouped by category already (Speed, then Endurance,
// etc.) — this just lists that same order once so the page renders one section per category
// instead of a flat wall of 20+ chips.
const CATEGORIES: Array<AchievementCategory> = [
  'Speed',
  'Endurance',
  'Precision',
  'Podium',
  'Timing',
]

function AchievementsPage() {
  const { hydrated, stats, races } = useProfile()
  const unlockedCount = hydrated
    ? ACHIEVEMENTS.filter((a) => a.unlocked(stats, races)).length
    : 0

  const byCategory = new Map<AchievementCategory, Array<Achievement>>()
  for (const achievement of ACHIEVEMENTS) {
    const list = byCategory.get(achievement.category) ?? []
    list.push(achievement)
    byCategory.set(achievement.category, list)
  }

  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <div className="mb-8">
          <div
            className="livery-stripe mb-4 w-16 rounded-full"
            aria-hidden="true"
          />
          <h1 className="rise-in text-3xl font-extrabold tracking-tight sm:text-4xl">
            Achievements.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {unlockedCount} of {ACHIEVEMENTS.length} unlocked
          </p>
        </div>

        <Card className="rise-in overflow-hidden">
          {CATEGORIES.map((category, i) => (
            <div key={category}>
              {i > 0 && <div className="glass-divider" />}
              <CardHeader className="py-5">
                <p className="kicker">{category}</p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 pt-0 pb-6 sm:grid-cols-2">
                {(byCategory.get(category) ?? []).map(
                  ({ icon: Icon, title, detail, unlocked }) => {
                    const done = hydrated && unlocked(stats, races)
                    return (
                      <div
                        key={title}
                        className={cn(
                          'glass-chip flex items-start gap-3 rounded-xl p-4 transition-opacity',
                          !done && 'opacity-50',
                        )}
                      >
                        <Icon
                          className={cn(
                            'size-6 shrink-0',
                            done ? 'text-primary' : 'text-muted-foreground',
                          )}
                          strokeWidth={2}
                        />
                        <div>
                          <p className="text-sm font-bold">{title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {detail}
                          </p>
                        </div>
                      </div>
                    )
                  },
                )}
              </CardContent>
            </div>
          ))}
        </Card>
      </div>
    </main>
  )
}
