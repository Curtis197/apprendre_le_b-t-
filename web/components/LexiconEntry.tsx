import Link from 'next/link'
import type { LexiconEntry as TLexiconEntry } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cleanBeteWord } from '@/lib/utils'
import { cleanBeteForm } from '@/lib/lexicon'

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.', part: 'Particule',
}

export function LexiconEntry({ entry }: { entry: TLexiconEntry }) {
  const posTag = entry.pos?.[0]
  const posLabel = posTag ? (POS_LABELS[posTag] ?? posTag) : null
  const western = cleanBeteForm(entry.bete_phonetic)
  const ipa = cleanBeteForm(entry.bete_word)
  const untranslated = !western && !ipa

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* Latin alphabet form as primary display */}
            <CardTitle className="text-2xl font-heading">{western || ipa || entry.top_french}</CardTitle>
            {/* Original Bible phonetic notation in brackets */}
            {western && ipa && ipa !== western && (
              <p className="text-sm text-muted-foreground font-mono">[{cleanBeteWord(ipa)}]</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {entry.validated && <Badge variant="secondary">✓ validé</Badge>}
            {posLabel && <Badge variant="outline">{posLabel}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {untranslated ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between gap-2">
            <span>Ce mot attend sa traduction en bhété.</span>
            <Link
              href={`/contribute?word=${encodeURIComponent(entry.top_french)}&type=word`}
              className="shrink-0 font-medium hover:underline"
            >
              Traduire →
            </Link>
          </div>
        ) : entry.source === 'seed' ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between gap-2">
            <span>Traduction automatique — aidez à l’améliorer en ajoutant des traductions ou une description.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
