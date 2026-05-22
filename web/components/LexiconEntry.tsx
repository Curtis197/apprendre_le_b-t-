import Link from 'next/link'
import { LexiconEntry as TLexiconEntry } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { VoteButtons } from './VoteButtons'
import { cleanBeteWord } from '@/lib/utils'

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.',
}

interface Props {
  entry: TLexiconEntry
  compact?: boolean
}

export function LexiconEntry({ entry, compact = false }: Props) {
  const posTag = entry.pos?.[0]
  const posLabel = posTag ? (POS_LABELS[posTag] ?? posTag) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            {/* Latin alphabet form as primary display */}
            <CardTitle className="text-xl">{entry.bete_phonetic}</CardTitle>
            {/* Original Bible phonetic notation in brackets */}
            <p className="text-sm text-muted-foreground font-mono">
              [{cleanBeteWord(entry.bete_word)}]
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {entry.validated && <Badge variant="secondary">✓ validé</Badge>}
            {posLabel && <Badge variant="outline">{posLabel}</Badge>}
            <VoteButtons table="lexicon" id={entry.id} upvotes={entry.upvotes} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entry.source === 'seed' && (
          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between gap-2">
            <span>Traduction automatique — aidez à valider ou améliorer ce mot.</span>
            <Link
              href={`/contribute?word=${encodeURIComponent(entry.top_french)}&type=word`}
              className="shrink-0 font-medium hover:underline"
            >
              Contribuer →
            </Link>
          </div>
        )}
        <p className="font-semibold text-blue-700">{entry.top_french}</p>
        {!compact && (entry.french_candidates?.length ?? 0) > 1 && (
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
