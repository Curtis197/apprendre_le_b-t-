import { LexiconEntry as TLexiconEntry } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { VoteButtons } from './VoteButtons'

interface Props {
  entry: TLexiconEntry
  compact?: boolean
}

export function LexiconEntry({ entry, compact = false }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{entry.bete_word}</CardTitle>
            <p className="text-sm text-muted-foreground font-mono">
              [{entry.bete_phonetic}]
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entry.validated && <Badge variant="secondary">✓ validé</Badge>}
            {entry.pos && <Badge variant="outline">{entry.pos}</Badge>}
            <VoteButtons table="lexicon" id={entry.id} upvotes={entry.upvotes} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-blue-700">{entry.top_french}</p>
        {!compact && entry.french_candidates.length > 1 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">Autres candidats :</p>
            <div className="flex flex-wrap gap-1">
              {entry.french_candidates.slice(1).map(c => (
                <Badge key={c.word} variant="outline" className="text-xs">
                  {c.word} ({(c.score * 100).toFixed(0)}%)
                </Badge>
              ))}
            </div>
          </div>
        )}
        {!compact && entry.notes && (
          <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
        )}
      </CardContent>
    </Card>
  )
}
