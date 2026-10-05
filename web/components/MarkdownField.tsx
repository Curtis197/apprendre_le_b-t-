'use client'
import { useState } from 'react'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Tab = 'write' | 'preview'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  maxLength?: number
  /** Tab shown on first render (tests only; forms never pass it). */
  initialTab?: Tab
}

const tabClass = (active: boolean) =>
  cn(
    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  )

/**
 * A text box written in Markdown, with a preview of the result. Same subset and same renderer as the
 * lessons (lib/courses/markdown.ts): raw HTML is never injected.
 */
export function MarkdownField({ id, value, onChange, rows = 6, placeholder, maxLength, initialTab = 'write' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="tablist" aria-label="Mode d’édition">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
          Écrire
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
          Aperçu
        </button>
      </div>

      {tab === 'write' ? (
        <Textarea
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          className="font-mono"
        />
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 min-h-[8rem] text-sm">
          {value.trim() ? (
            <LessonMarkdown source={value} />
          ) : (
            <p className="text-muted-foreground">Rien à afficher pour l’instant.</p>
          )}
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Aide à la mise en forme</summary>
        <ul className="mt-2 space-y-1">
          <li>{'## Titre, **gras**, *italique*, `code`'}</li>
          <li>{'- élément de liste, ou 1. liste numérotée, > citation'}</li>
          <li>{'[texte](https://adresse) pour un lien'}</li>
          <li>
            <code className="text-primary font-semibold">{':::gloss … :::'}</code> : glose interlinéaire en 3 lignes (bété,
            mot à mot, sens). Le bloc se termine par <code>:::</code>.
          </li>
        </ul>
      </details>
    </div>
  )
}
