// Talks to backend/api (a separate Go service — see backend/api/README.md), which serves real
// scraped quotes already filtered and normalized for a typing race (right word-count range,
// keyboard-typeable punctuation). Falls back to the static pool in sentences.ts on any failure
// — API not running, network error, or a genuine "nothing matched" 404 — so the game always
// has something to show even without the backend up.
export interface TypingQuote {
  text: string
  author: string
  source: string
  language: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchRandomSentence(
  exclude?: string,
): Promise<TypingQuote> {
  const params = new URLSearchParams()
  if (exclude) params.set('exclude', exclude)

  const response = await fetch(`${API_URL}/api/quotes/random?${params}`)
  if (!response.ok) {
    throw new Error(`quotes API returned ${response.status}`)
  }
  return response.json()
}
