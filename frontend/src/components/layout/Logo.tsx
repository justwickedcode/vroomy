// A gauge glyph rather than a letter-in-a-box — the same needle-and-arc
// motif the WPM/accuracy readouts already use throughout the app, so the
// mark actually ties to the product instead of being an arbitrary monogram.
export default function Logo() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 16a7.5 7.5 0 1 1 15 0" />
      <path d="M12 16l4.2-5.2" />
      <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}
