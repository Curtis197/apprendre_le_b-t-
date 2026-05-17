import { TranslationResult, FeedbackToken } from '@/lib/types'
import { FeedbackButton } from './FeedbackButton'

function TokenCard({ token }: { token: FeedbackToken }) {
  return (
    <div className="border rounded p-2 text-center min-w-[80px]">
      <p className="text-xs text-muted-foreground">{token.french_word}</p>
      <p className="font-bold text-sm">{token.bete_western}</p>
      <p className="text-xs font-mono text-muted-foreground">{token.bete_word}</p>
      <FeedbackButton token={token} />
    </div>
  )
}

interface Props {
  result: TranslationResult
}

export function TranslatorOutput({ result }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-lg font-semibold">{result.sentence}</p>
        {result.sentence_phonetic && result.sentence_phonetic !== result.sentence && (
          <p className="text-sm font-mono text-muted-foreground">{result.sentence_phonetic}</p>
        )}
      </div>
      {result.unknowns.length > 0 && (
        <p className="text-xs text-amber-600">
          Mots non traduits : {result.unknowns.join(', ')}
        </p>
      )}
      {result.rules_applied.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Règles : {result.rules_applied.join(' · ')}
        </p>
      )}
      {result.tokens.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.tokens.map((token, i) => (
            <TokenCard key={i} token={token} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {result.cached ? '⚡ Depuis le cache' : '🤖 Traduction générée'}
      </p>
    </div>
  )
}
