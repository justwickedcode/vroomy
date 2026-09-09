import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '#/components/ui/card'
import { ACHIEVEMENTS } from '#/lib/achievements'
import { useProfile } from '#/lib/profile/useProfile'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/achievements')({
  component: AchievementsPage,
})

function AchievementsPage() {
  const { hydrated, stats, races } = useProfile()
  const unlockedCount = hydrated
    ? ACHIEVEMENTS.filter((a) => a.unlocked(stats, races)).length
    : 0

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-2xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-6">
            <p className="kicker mb-4">
              {unlockedCount} of {ACHIEVEMENTS.length} unlocked
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ACHIEVEMENTS.map(({ icon: Icon, title, detail, unlocked }) => {
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
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
