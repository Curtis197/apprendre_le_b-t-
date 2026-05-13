import { TranslationResult, TranslationToken } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { FeedbackButton } from './FeedbackButton'

function TokenCard({ token }: { token: TranslationToken }) {
  const confidence = token.score >= 0.7 ? 'high' : token.score >= 0.4 ? 'medium' : 'low'
  const borderColor = {
    high: 'border-green-300',
    medium: 'border-yellow-300',
    low: 'border-red-200',
  }[confidence]

  return (
    <div className={`border rounded p-2 text-center min-w-[80px] ${borderColor}`}>
      <p className="text-xs text-muted-foreground">{token.french_word}</p>
      <p className="font-bold text-sm">{token.bete_phonetic}</p>
      <p className="text-xs font-mono text-muted-foreground">{token.bete_word}</p>
      {token.is_expression && (
        <Badge variant="secondary" className="text-xs mt-1">expression</Badge>
      )}
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
      <div className="flex flex-wrap gap-2">
        {result.tokens.map((token, i) => (
          <TokenCard key={i} token={token} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {result.cached ? '⚡ Depuis le cache' : '🤖 Traduction générée'}
      </p>
    </div>
  )
}
