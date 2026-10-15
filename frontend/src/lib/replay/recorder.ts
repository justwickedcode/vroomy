import { useCallback, useRef } from 'react'
import type { ReplayData, ReplayEvent } from '#/lib/api/types'

// Matches backend/api/replays.go's maxReplayEvents — past this the replay is dropped rather
// than sent and rejected.
const MAX_EVENTS = 6000

// useReplayRecorder captures a race as a timeline of [ms, typedLength, rejected] events (see
// ReplayEvent). Both race hooks only ever accept correct characters, so what the player had
// typed at any moment is just passage.slice(0, typedLength) — a whole race is a few KB.
//
// Kept in a ref, not state: recording happens on every keystroke and nothing renders from it.
export function useReplayRecorder() {
  const eventsRef = useRef<Array<ReplayEvent>>([])

  const record = useCallback(
    (startedAt: number, typedLength: number, rejected: boolean) => {
      const events = eventsRef.current
      if (events.length >= MAX_EVENTS) return
      const last = events.at(-1)
      // Date.now() can step backwards (clock adjustments); a replay's timeline must not.
      const t = Math.max(Date.now() - startedAt, last?.[0] ?? 0, 0)
      events.push([t, typedLength, rejected ? 1 : 0])
    },
    [],
  )

  const reset = useCallback(() => {
    eventsRef.current = []
  }, [])

  // The finished race's replay, or null if it can't be one (nothing recorded, the event cap was
  // hit, or the timeline never reached the end of the passage).
  const snapshot = useCallback((passage: string): ReplayData | null => {
    const events = eventsRef.current
    const last = events.at(-1)
    if (!last || events.length >= MAX_EVENTS || last[1] !== passage.length) {
      return null
    }
    return { passage, events: [...events] }
  }, [])

  return { record, reset, snapshot }
}
