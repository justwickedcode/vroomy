import { createFileRoute } from '@tanstack/react-router'
import PlayPicker from '#/components/play/PlayPicker'

export const Route = createFileRoute('/race/solo/')({ component: SoloSetup })

// The dashboard's Play modal as a page for direct links, opened on Solo.
function SoloSetup() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap rise-in max-w-3xl">
        <PlayPicker initialMode="solo" />
      </div>
    </main>
  )
}
