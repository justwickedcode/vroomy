import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '#/components/ui/card'
import FriendsPicker from '#/components/play/FriendsPicker'

export const Route = createFileRoute('/race/friends')({
  component: FriendsPage,
})

// The same picker as the dashboard's Friends modal, as a page for direct links and for
// leaving a room.
function FriendsPage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden">
          <CardContent className="pt-5">
            <FriendsPicker />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
