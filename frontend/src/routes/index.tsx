import { createFileRoute } from '@tanstack/react-router'
import TypingRace from '#/components/typing/TypingRace'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="page-wrap">
        <TypingRace />
      </div>
    </main>
  )
}
