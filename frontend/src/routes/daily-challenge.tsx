import { createFileRoute } from '@tanstack/react-router'
import DailyChallengeCard from '#/components/typing/DailyChallengeCard'

export const Route = createFileRoute('/daily-challenge')({
  component: DailyChallengePage,
})

function DailyChallengePage() {
  return (
    <main className="flex-1 px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <DailyChallengeCard />
      </div>
    </main>
  )
}
