import { createFileRoute } from '@tanstack/react-router'
import DailyChallengeCard from '#/components/typing/DailyChallengeCard'

export const Route = createFileRoute('/daily-challenge')({
  component: DailyChallengePage,
})

function DailyChallengePage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-6">
      <div className="page-wrap">
        <DailyChallengeCard />
      </div>
    </main>
  )
}
