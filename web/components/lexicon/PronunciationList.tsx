'use client'
import { useState } from 'react'
import { publicAudioUrl } from '@/lib/lexicon-audio'
import type { PronunciationRow } from '@/lib/lexicon-audio-data'

interface Props {
  items: PronunciationRow[]
  /** null: signed out (listening only). */
  userId: string | null
  isAdmin: boolean
  busy: boolean
  error: string
  notice: string
  onDelete: (id: string) => void
  onReport: (id: string, message: string) => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'
const formatDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function PronunciationList({ items, userId, isAdmin, busy, error, notice, onDelete, onReport }: Props) {
  const [reporting, setReporting] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Aucune prononciation enregistrée pour ce mot.</p>
        {notice && <p className="text-xs text-primary" role="status">{notice}</p>}
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map(r => {
          const mine = userId !== null && r.createdBy === userId
          const canDelete = mine || isAdmin
          return (
            <li key={r.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{r.author}</span>
                  {formatDate(r.createdAt) && ` · ${formatDate(r.createdAt)}`}
                </span>
                <span className="flex gap-2">
                  {canDelete && (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Supprimer cet enregistrement ?')) onDelete(r.id)
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                  {userId !== null && !mine && (
                    <button type="button" className={btn} disabled={busy} onClick={() => setReporting(reporting === r.id ? null : r.id)}>
                      Signaler
                    </button>
                  )}
                </span>
              </div>
              <audio controls preload="none" src={publicAudioUrl(r.path)} className="w-full" />
              {reporting === r.id && (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                    rows={2}
                    maxLength={1000}
                    placeholder="Qu’est-ce qui ne va pas ? (bruit, mauvais mot…)"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`${btn} bg-primary text-primary-foreground`}
                    disabled={busy}
                    onClick={() => {
                      onReport(r.id, message)
                      setReporting(null)
                      setMessage('')
                    }}
                  >
                    Envoyer le signalement
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {notice && <p className="text-xs text-primary" role="status">{notice}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}
