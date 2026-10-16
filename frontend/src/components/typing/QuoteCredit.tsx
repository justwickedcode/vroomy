import { ExternalLink } from '#/components/ui/icons'
import { cn } from '#/lib/utils'

// Only http(s) links are rendered — sourceUrl comes from scraped data, and anything else (a
// javascript: URL, say) must never become a clickable href.
function safeSource(sourceUrl?: string | null): URL | null {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

// "— Author · goodreads.com ↗" under a passage: who said it, and a link to the exact page the
// crawler took it from. Renders nothing for the local fallback sentences, which have neither.
export default function QuoteCredit({
  author,
  sourceUrl,
  className,
}: {
  author?: string | null
  sourceUrl?: string | null
  className?: string
}) {
  const source = safeSource(sourceUrl)
  if (!author && !source) return null

  return (
    <p
      className={cn(
        'flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-sm text-muted-foreground',
        className,
      )}
    >
      {author && <span className="italic">— {author}</span>}
      {author && source && <span aria-hidden="true">·</span>}
      {source && (
        <a
          href={source.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline-offset-2 hover:text-primary hover:underline"
          title="Where this quote was found"
        >
          {source.hostname.replace(/^www\./, '')}
          <ExternalLink className="size-3" />
        </a>
      )}
    </p>
  )
}
