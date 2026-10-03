'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import {
  TARGET_TYPE_LABELS,
  canResolve,
  correctionHref,
  fieldLabel,
  isStale,
  kindLabel,
  type Correction,
} from '@/lib/corrections'
import { acceptCorrection, rejectCorrection, withdrawCorrection } from '@/lib/corrections-mutations'

interface Props {
  correction: Correction
  /** The field's text now, to tell when the report is out of date. Leave out where it is not known. */
  currentValue?: string | null
  userId: string | null
  isAdmin: boolean
  /** Name and link the content the report is about (for lists that mix several). */
  showTarget?: boolean
  /** Called after any action, so the list can reload. */
  onChanged: () => void
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function CorrectionItem({ correction: c, currentValue, userId, isAdmin, showTarget, onChanged }: Props) {
  const supabaseRef = useRef(createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stale = currentValue !== undefined && isStale(c, currentValue)
  const resolver = canResolve(c, userId, isAdmin)
  const isReporter = userId !== null && c.reporter_id === userId
  const href = correctionHref(c)

  async function run(action: () => Promise<{ error: string | null }>) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) { setError(err); return }
    onChanged()
  }

  return (
    <li className="rounded-lg border border-border bg-card px-3 py-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{c.reporter_name}</span> · {formatDate(c.created_at)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{kindLabel(c.kind)}</Badge>
          <Badge variant="secondary">{fieldLabel(c.target_type, c.field)}</Badge>
        </div>
      </div>

      {showTarget && (
        <p className="text-xs text-muted-foreground">
          {TARGET_TYPE_LABELS[c.target_type]}
          {c.label ? ' : ' : ''}
          {href && c.label ? (
            <Link href={href} className="text-primary hover:underline font-medium">{c.label}</Link>
          ) : (
            <span className="font-medium text-foreground">{c.label}</span>
          )}
        </p>
      )}

      {c.message && <p className="whitespace-pre-wrap leading-relaxed">{c.message}</p>}

      {c.suggestion && (
        <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1.5">
          {c.original && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avant</p>
              <p className="whitespace-pre-wrap text-muted-foreground line-through">{c.original}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Proposé</p>
            <p className="whitespace-pre-wrap font-medium">{c.suggestion}</p>
          </div>
        </div>
      )}

      {stale && <p className="text-xs text-amber-700">Le texte a changé depuis ce signalement.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {resolver && c.suggestion && !stale && (
          <Button size="sm" disabled={busy} onClick={() => run(() => acceptCorrection(supabaseRef.current, c.id))}>
            Accepter
          </Button>
        )}
        {resolver && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => rejectCorrection(supabaseRef.current, c.id))}>
            Refuser
          </Button>
        )}
        {isReporter && (
          <button
            type="button"
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={() => run(() => withdrawCorrection(supabaseRef.current, c.id))}
          >
            Retirer mon signalement
          </button>
        )}
        {isAdmin && !isReporter && (
          <button
            type="button"
            disabled={busy}
            className="text-xs text-destructive/80 hover:text-destructive disabled:opacity-50"
            onClick={() => {
              if (!window.confirm('Supprimer ce signalement ?')) return
              run(() => withdrawCorrection(supabaseRef.current, c.id))
            }}
          >
            Supprimer
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  )
}
