'use client'
import Link from 'next/link'
import { useDialect } from '@/context/DialectContext'
import { DIALECTS, DIALECT_KEYS } from '@/lib/dialect'
import type { TranslatorCounts } from '@/lib/translator-threshold'
import { WORD_TARGET, GRAMMAR_TARGET } from '@/lib/translator-threshold'

interface Props {
  counts: TranslatorCounts
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0)
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function TranslatorProgress({ counts }: Props) {
  const { dialect } = useDialect()

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Le traducteur sera disponible pour chaque dialecte une fois les seuils atteints.
        Contribuez au lexique pour accélérer son ouverture.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {DIALECT_KEYS.map(d => {
          const wordCount = counts.words[d]
          const isActive = d === dialect
          return (
            <div
              key={d}
              className={`rounded-xl border p-4 space-y-4 transition-colors ${
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                  {DIALECTS[d].name}
                </p>
                {isActive && (
                  <span className="text-xs bg-primary text-white rounded-full px-2 py-0.5">
                    actuel
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mots</span>
                  <span className="font-mono font-medium text-foreground">
                    {wordCount} / {WORD_TARGET}
                  </span>
                </div>
                <ProgressBar value={wordCount} max={WORD_TARGET} />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Règles grammaticales</span>
                  <span className="font-mono font-medium text-foreground">
                    {counts.grammar} / {GRAMMAR_TARGET}
                  </span>
                </div>
                <ProgressBar value={counts.grammar} max={GRAMMAR_TARGET} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-center">
        <Link
          href="/contribute"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Contribuer au lexique →
        </Link>
      </div>
    </div>
  )
}
