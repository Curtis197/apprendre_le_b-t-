import { TranslationResult, FeedbackToken } from '@/lib/types'
import { FeedbackButton } from './FeedbackButton'
import { Badge } from '@/components/ui/badge'

interface Props {
  result: TranslationResult
}

export function TranslatorOutput({ result }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Ce traducteur est en cours de construction. Les traductions sont automatiques et peuvent
        contenir des erreurs. Elles s&apos;amélioreront grâce aux contributions de la communauté.
      </p>

      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-xs text-muted-foreground mb-1">Bété (écriture courante)</p>
        <p className="text-xl font-semibold">{result.sentence}</p>
      </div>

      {result.sentence_phonetic && result.sentence_phonetic !== result.sentence && (
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Phonétique (forme biblique)</p>
          <p className="text-base font-mono">{result.sentence_phonetic}</p>
        </div>
      )}

      {result.unknowns.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Mots non traduits — aidez-nous à les ajouter au lexique :
          </p>
          <div className="flex flex-wrap gap-2">
            {result.unknowns.map(w => (
              <Badge key={w} variant="outline" className="text-red-600 border-red-300">
                {w}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {result.rules_applied.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Règles : {result.rules_applied.join(' · ')}
        </p>
      )}

      {result.tokens.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Détail mot à mot
          </summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {result.tokens.map((token, i) => (
              <div key={i} className="border rounded p-2 text-center min-w-[80px]">
                <p className="text-xs text-muted-foreground">{token.french_word}</p>
                <p className="font-bold text-sm">{token.bete_western}</p>
                <p className="text-xs font-mono text-muted-foreground">{token.bete_word}</p>
                <FeedbackButton token={token} />
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        {result.cached ? '⚡ Depuis le cache' : '🤖 Traduction générée'}
      </p>
    </div>
  )
}
