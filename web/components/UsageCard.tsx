import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { splitHighlight, usageHref, usageSourceLabel, type UsageRow, type UsageSide } from '@/lib/usages'

function Highlighted({ text, tokens, side }: { text: string; tokens: string[]; side: UsageSide }) {
  return (
    <>
      {splitHighlight(text, tokens, side).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function UsageCard({ row, side }: { row: UsageRow; side: UsageSide }) {
  const href = usageHref(row)
  const label = usageSourceLabel(row)
  const tokens = row.matched_tokens ?? []

  return (
    <article className="rounded-lg border border-border px-4 py-3 space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {href ? (
          <Link href={href} className="text-xs font-medium text-primary hover:underline truncate max-w-full">
            {label} →
          </Link>
        ) : (
          <span className="text-xs font-medium text-muted-foreground truncate max-w-full">{label}</span>
        )}
        {row.match_kind === 'variant' && (
          <Badge variant="outline" className="text-xs">variante : {tokens.join(', ')}</Badge>
        )}
      </div>

      <p className="font-heading text-lg leading-snug break-words">
        {side === 'bete' ? <Highlighted text={row.bete} tokens={tokens} side="bete" /> : row.bete}
      </p>
      {row.literal && <p className="text-sm text-muted-foreground italic break-words">{row.literal}</p>}
      {row.french && (
        <p className="text-sm break-words">
          {side === 'fr' ? <Highlighted text={row.french} tokens={tokens} side="fr" /> : row.french}
        </p>
      )}
    </article>
  )
}
