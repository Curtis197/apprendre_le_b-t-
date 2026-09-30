'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Copy, Check } from 'lucide-react'
import { TranslationResult } from '@/lib/types'
import { FeedbackButton } from './FeedbackButton'
import { Badge } from '@/components/ui/badge'

interface Props {
  result: TranslationResult
}

export function TranslatorOutput({ result }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.sentence)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Ce traducteur est en cours de construction. Les traductions sont automatiques et s&apos;améliorent
        grâce aux contributions de la communauté.
      </p>

      {/* ── Tier 1: Original text (Source) ── */}
      <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          1. Texte original (Français)
        </span>
        <p className="text-base font-medium text-foreground">{result.input}</p>
      </div>

      {/* ── Tier 2: Word-to-word Interlinear Gloss (Literal) ── */}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            2. Mot à mot (Structure de la pensée)
          </span>
          {result.tokens.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {result.tokens.length} terme{result.tokens.length > 1 ? 's' : ''} aligné{result.tokens.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {result.literal && (
          <p className="text-xs md:text-sm italic text-foreground/90 bg-card rounded-lg px-3 py-2 border border-border/60">
            <strong className="not-italic font-semibold text-primary">Sens littéral :</strong> « {result.literal} »
          </p>
        )}

        {result.tokens.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {result.tokens.map((token, i) => (
              <div
                key={i}
                className="bg-card border border-border/80 rounded-lg p-2 text-center min-w-[75px] shadow-xs flex flex-col justify-between"
              >
                <div>
                  <p className="text-[11px] text-muted-foreground truncate">{token.french_word}</p>
                  <p className="font-bold text-sm text-foreground my-0.5">{token.bete_western}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{token.bete_word}</p>
                </div>
                <div className="mt-1">
                  <FeedbackButton token={token} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tier 3: Final translation (Fluent Bhété) ── */}
      <div className="rounded-xl border-2 border-secondary/30 p-4 md:p-5 bg-secondary/5 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">
            3. Traduction finale (Bhété courant)
          </span>
          <button
            type="button"
            onClick={handleCopy}
            title="Copier la traduction"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-secondary/10"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>

        <p className="text-2xl md:text-3xl font-bold font-heading text-foreground">{result.sentence}</p>

        {result.sentence_phonetic && result.sentence_phonetic !== result.sentence && (
          <div className="text-xs font-mono text-muted-foreground pt-1 border-t border-border/40">
            Forme biblique / tons : <span className="text-foreground">{result.sentence_phonetic}</span>
          </div>
        )}
      </div>

      {/* Unknown words alert */}
      {result.unknowns.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Mots non traduits — aidez-nous à les ajouter au lexique :
          </p>
          <div className="flex flex-wrap gap-2">
            {result.unknowns.map(w => (
              <Link
                key={w}
                href={`/contribute?word=${encodeURIComponent(w)}&type=word`}
                className="inline-flex"
              >
                <Badge
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50 cursor-pointer transition-colors"
                >
                  {w} — Contribuer →
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Grammar rules applied */}
      {result.rules_applied.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Règles appliquées : {result.rules_applied.join(' · ')}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>{result.cached ? '⚡ Depuis le cache' : '🤖 Traduction générée'}</span>
      </div>

      {/* Debug pipeline log */}
      {result.debug && result.debug.length > 0 && (
        <details className="text-xs pt-1">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-mono">
            🔍 Pipeline log ({result.debug[result.debug.length - 1].ms}ms)
          </summary>
          <div className="mt-2 rounded-lg border bg-zinc-950 text-zinc-100 p-3 font-mono overflow-x-auto text-[11px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left pr-4 pb-1 font-normal">ms</th>
                  <th className="text-left pr-4 pb-1 font-normal">step</th>
                  <th className="text-left pb-1 font-normal">detail</th>
                </tr>
              </thead>
              <tbody>
                {result.debug.map((entry, i) => (
                  <tr key={i} className="border-b border-zinc-800 last:border-0">
                    <td className="pr-4 py-0.5 text-zinc-500 whitespace-nowrap">{entry.ms}</td>
                    <td className="pr-4 py-0.5 text-emerald-400 whitespace-nowrap">{entry.step}</td>
                    <td className="py-0.5 text-zinc-300 break-words">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
