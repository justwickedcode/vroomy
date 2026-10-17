import { createFileRoute } from '@tanstack/react-router'
import PlayPicker from '#/components/play/PlayPicker'

export const Route = createFileRoute('/race/friends')({
  component: FriendsPage,
})

// The dashboard's Play modal as a page for direct links and for leaving a room, opened on
// Friends.
function FriendsPage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap rise-in max-w-3xl">
        <PlayPicker initialMode="friends" />
      </div>
    </main>
  )
}
