import { createFileRoute } from '@tanstack/react-router'
import { ACHIEVEMENTS, achievementReward } from '#/lib/achievements'
import Coins from '#/components/ui/Coins'
import PixelMeter from '#/components/ui/PixelMeter'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'
import type { Achievement, AchievementCategory } from '#/lib/achievements'

export const Route = createFileRoute('/achievements')({
  component: AchievementsPage,
})

// Declaration order in ACHIEVEMENTS is grouped by category already (Speed, then Endurance,
// etc.) — this just lists that same order once so the page renders one section per category.
const CATEGORIES: Array<AchievementCategory> = [
  'Speed',
  'Endurance',
  'Precision',
  'Podium',
  'Timing',
]

const CELL = 'bg-card'

function Badge({
  achievement,
  done,
}: {
  achievement: Achievement
  done: boolean
}) {
  const { id, icon: Icon, title, detail } = achievement
  return (
    <div
      className={cn(
        CELL,
        'flex flex-col items-center gap-2 p-5 text-center',
        !done && 'opacity-45',
      )}
    >
      <Icon className={cn('size-10', !done && 'grayscale')} />
      <p className="text-sm font-bold">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      <Coins
        amount={achievementReward(id)}
        prefix={done ? '' : '+'}
        className={cn(
          'mt-auto text-xs',
          done ? 'text-muted-foreground' : 'text-signal',
        )}
      />
    </div>
  )
}

function AchievementsPage() {
  const { hydrated, achievements } = useProfile()
  const unlocked = hydrated ? achievements : []
  const earned = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).reduce(
    (sum, a) => sum + achievementReward(a.id),
    0,
  )
  const byCategory = new Map<AchievementCategory, Array<Achievement>>()
  for (const achievement of ACHIEVEMENTS) {
    const list = byCategory.get(achievement.category) ?? []
    list.push(achievement)
    byCategory.set(achievement.category, list)
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:py-10">
      <div className="page-wrap flex flex-1 flex-col">
        {/* One connected panel, like the dashboard: progress up top, then a grid of badges per
            category whose cells share single dividing lines. */}
        <div className="rise-in px-corners grid flex-1 content-start gap-[2px] border-2 border-border bg-border">
          <div className={cn(CELL, 'grid gap-4 p-5 sm:grid-cols-[1fr_auto]')}>
            <div className="flex flex-col gap-3">
              <p className="kicker">Achievements</p>
              <p className="font-display text-4xl leading-none">
                {unlocked.length}
                <span className="text-xl text-muted-foreground">
                  /{ACHIEVEMENTS.length}
                </span>
              </p>
              <PixelMeter
                frac={unlocked.length / ACHIEVEMENTS.length}
                segments={ACHIEVEMENTS.length}
                className="gap-[2px]"
              />
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <p className="kicker">Earned</p>
              <Coins amount={earned} className="text-2xl text-signal" />
            </div>
          </div>

          {CATEGORIES.map((category) => {
            const list = byCategory.get(category) ?? []
            const done = list.filter((a) => unlocked.includes(a.id)).length
            return (
              <section key={category} className={cn(CELL, 'p-5')}>
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="kicker">{category}</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {done}/{list.length}
                  </span>
                </div>
                <div className="px-corners grid grid-cols-2 border-2 border-border sm:grid-cols-3 lg:grid-cols-4 [&>*]:shadow-[0_0_0_1px_var(--color-border)]">
                  {list.map((achievement) => (
                    <Badge
                      key={achievement.id}
                      achievement={achievement}
                      done={unlocked.includes(achievement.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}
