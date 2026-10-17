import { useCallback, useEffect, useRef } from 'react'
import { requestRaceTicketFn } from '#/lib/api/functions'
import { useCurrentUser } from '#/lib/auth/useCurrentUser'

const NO_TICKET: Promise<string | null> = Promise.resolve(null)

// Asks the api for a race ticket as soon as a passage is on screen, ahead of the race itself — a
// logged-in player's race is only saved to their account against one (see
// backend/api/tickets.go). Guests get none: their races stay in the browser. A new ticket is
// fetched whenever `attempt` changes, since each one is good for a single race.
export function useRaceTicket({
  mode,
  passage,
  attempt,
  dailyDate,
}: {
  mode: 'solo' | 'daily'
  passage: string
  attempt?: unknown
  dailyDate?: string
}) {
  const { user } = useCurrentUser()
  const loggedIn = user !== null
  const ticketRef = useRef(NO_TICKET)

  useEffect(() => {
    if (!loggedIn || !passage) {
      ticketRef.current = NO_TICKET
      return
    }
    ticketRef.current = requestRaceTicketFn({
      data: { mode, passage, dailyDate },
    })
      .then((res) => res.ticket)
      .catch((err: unknown) => {
        console.warn('Could not get a race ticket:', err)
        return null
      })
  }, [loggedIn, mode, passage, attempt, dailyDate])

  return useCallback(() => ticketRef.current, [])
}
