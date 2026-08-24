// Placeholder pool. The Go scraper (backend/scraper) will eventually feed
// real passages here over an API instead of this static list.
//
// Kept deliberately long (~35-45 words): a short sentence finishes in a
// couple of seconds even for an average typist, and extrapolating a
// multi-second burst to a per-minute rate is numerically unstable — small
// timing noise turns into a wildly overestimated WPM. Longer passages give
// the WPM/accuracy numbers enough time to settle into something meaningful.
const SENTENCE_POOL = [
  'The quick brown fox jumps over the lazy dog while the storm rolls in from the coast, and somewhere in the distance a rooster crows before the sun has even started to rise over the quiet hills.',
  'Racing against the clock is the only way to know how fast your fingers really are, and every second you save today becomes the difference between a decent lap and a record breaking run tomorrow.',
  'Practice does not make perfect, only perfect practice makes perfect, and the fastest typists in the world got there not through talent alone but through thousands of hours spent chasing consistency over speed.',
  'A journey of a thousand miles begins with a single carefully typed word, and every champion who has ever crossed a finish line first had to start exactly where you are standing right now.',
  'Speed without accuracy is just noise, but accuracy without speed is just slow, so the real skill in any race worth winning is learning how to balance both without sacrificing either one entirely.',
  'The best typists never look down at their keyboard, they trust their fingers completely and keep their eyes locked firmly on the screen ahead, reacting to every word before it even fully appears.',
  'Every champion was once a contender who refused to give up on a single race, no matter how many times the finish line seemed impossibly far away or the competition seemed unbeatable that day.',
  'Keep your eyes on the words ahead, not on the mistakes you already made, because the fastest way to lose a race is to spend more time thinking about the past than the road ahead.',
]

export function getRandomSentence(exclude?: string): string {
  const pool = SENTENCE_POOL.filter((sentence) => sentence !== exclude)
  const candidates = pool.length > 0 ? pool : SENTENCE_POOL
  return candidates[Math.floor(Math.random() * candidates.length)]
}
