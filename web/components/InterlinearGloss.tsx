'use client'
import { useState } from 'react'
import { Copy, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GlossToken {
  original: string
  gloss: string
  phonetic?: string
}

interface Props {
  original: string
  literal?: string | null
  final?: string | null
  phonetic?: string | null
  tokens?: GlossToken[]
  title?: string
  className?: string
  variant?: 'card' | 'inline' | 'compact'
}

export function InterlinearGloss({
  original,
  literal,
  final,
  phonetic,
  tokens,
  title,
  className = '',
  variant = 'card',
}: Props) {
  const [copied, setCopied] = useState(false)

  // Derive tokens if not provided directly, by pairing whitespace tokens if lengths match
  const derivedTokens: GlossToken[] =
    tokens && tokens.length > 0
      ? tokens
      : (() => {
          if (!literal) return []
          const origWords = original.trim().split(/\s+/)
          const litWords = literal.trim().split(/\s+/)
          if (origWords.length === litWords.length && origWords.length > 1) {
            return origWords.map((orig, i) => ({
              original: orig,
              gloss: litWords[i],
            }))
          }
          return []
        })()

  const copyText = final || original

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  if (variant === 'compact') {
    return (
      <div className={cn('text-sm space-y-1 p-3 border rounded-lg bg-card/60', className)}>
        <p className="font-semibold text-foreground">{original}</p>
        {literal && (
          <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
            <span className="font-medium not-italic text-primary/80">Mot à mot :</span>
            <span>« {literal} »</span>
          </p>
        )}
        {final && <p className="text-sm text-foreground/90 font-medium">{final}</p>}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm transition-all',
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <h4 className="font-heading font-semibold text-sm flex items-center gap-2 text-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            {title}
          </h4>
          <button
            type="button"
            onClick={handleCopy}
            title="Copier"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}

      {/* Tier 1: Original text */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          1. Texte original
        </span>
        <div className="text-lg md:text-xl font-bold font-heading text-foreground tracking-wide">
          {original}
        </div>
        {phonetic && phonetic !== original && (
          <div className="text-xs font-mono text-muted-foreground pt-0.5">
            [forme phonétique : {phonetic}]
          </div>
        )}
      </div>

      {/* Tier 2: Word-to-word Interlinear Gloss */}
      {(literal || derivedTokens.length > 0) && (
        <div className="rounded-lg bg-muted/40 border border-border/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              2. Mot à mot (Structure de la pensée)
            </span>
          </div>

          {/* Interlinear vertical aligned columns if tokenized */}
          {derivedTokens.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pb-1 overflow-x-auto">
              {derivedTokens.map((tok, i) => (
                <div
                  key={i}
                  className="inline-flex flex-col items-center bg-card border border-border/80 rounded px-2.5 py-1.5 min-w-[55px] text-center"
                >
                  <span className="font-semibold text-xs text-foreground">{tok.original}</span>
                  <span className="text-[11px] text-primary/90 font-medium italic mt-0.5">{tok.gloss}</span>
                  {tok.phonetic && (
                    <span className="text-[10px] font-mono text-muted-foreground">{tok.phonetic}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {literal && (
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              <strong className="not-italic text-foreground font-medium">Sens littéral :</strong> « {literal} »
            </p>
          )}
        </div>
      )}

      {/* Tier 3: Final translation / Idiomatic meaning */}
      {final && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">
            3. Traduction finale (Sens naturel)
          </span>
          <p className="text-base md:text-lg font-semibold text-foreground leading-relaxed">
            {final}
          </p>
        </div>
      )}
    </div>
  )
}
