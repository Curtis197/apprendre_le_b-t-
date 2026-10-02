'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import {
  CORRECTION_KINDS,
  MESSAGE_MAX,
  SUGGESTION_MAX,
  correctionFields,
  type Correction,
  type CorrectionKind,
  type CorrectionTargetType,
} from '@/lib/corrections'
import { createCorrection, getOpenCorrections } from '@/lib/corrections-mutations'
import { CorrectionItem } from '@/components/CorrectionItem'

interface Props {
  targetType: CorrectionTargetType
  targetId: string
  /** The fields a reader can report on this content, with their text now. A field left out cannot be reported. */
  fields: { field: string; current: string | null }[]
  /** The content's author, if known: they edit it directly, so they are not offered to report it. */
  ownerId: string | null
  /** Start with the report form already open (when the reader came here to report). */
  startOpen?: boolean
}

export function CorrectionBox({ targetType, targetId, fields, ownerId, startOpen = false }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabaseRef = useRef(createClient())

  // undefined until the session is known: nothing is offered before that (no flash of a login link)
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(startOpen)

  const available = correctionFields(targetType).filter(f => fields.some(x => x.field === f.field))
  const currentOf = (field: string) => fields.find(f => f.field === field)?.current ?? null

  const [field, setField] = useState(available[0]?.field ?? '')
  const [kind, setKind] = useState<CorrectionKind>('mistranslation')
  const [message, setMessage] = useState('')
  const [suggestion, setSuggestion] = useState(currentOf(available[0]?.field ?? '') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setCorrections(await getOpenCorrections(supabaseRef.current, targetType, targetId))
  }, [targetType, targetId])

  useEffect(() => {
    const sb = supabaseRef.current
    let cancelled = false
    sb.auth.getUser().then(async ({ data }) => {
      if (cancelled) return
      setUserId(data.user?.id ?? null)
      if (data.user) {
        const res = await sb.rpc('is_admin')
        if (!cancelled) setIsAdmin(res.data === true)
      }
    })
    load()
    return () => { cancelled = true }
  }, [load])

  const isOwner = typeof userId === 'string' && ownerId !== null && ownerId === userId
  const selected = available.find(f => f.field === field)

  function chooseField(next: string) {
    setField(next)
    setSuggestion(currentOf(next) ?? '')   // start from the current text: the reader edits what is wrong
    setError(null)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    // a suggestion left equal to the current text means "no suggestion", only the message
    const unchanged = suggestion.trim() === (currentOf(field) ?? '').trim()
    const res = await createCorrection(
      supabaseRef.current,
      { targetType, targetId, field, kind, message, suggestion: unchanged ? '' : suggestion },
      currentOf(field),
    )
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setMessage('')
    setSuggestion(currentOf(field) ?? '')
    setFormOpen(false)
    setListOpen(true)
    await load()
    router.refresh()
  }

  async function changed() {
    await load()
    router.refresh()
  }

  if (available.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {userId !== undefined && !isOwner && (
          userId === null ? (
            <Link
              href={`/auth?next=${encodeURIComponent(pathname)}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              Signaler une erreur
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(o => !o)}
              aria-expanded={formOpen}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              Signaler une erreur
            </button>
          )
        )}
        {corrections.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen(o => !o)}
            aria-expanded={listOpen}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
          >
            {corrections.length} signalement{corrections.length > 1 ? 's' : ''}
            {listOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {formOpen && typeof userId === 'string' && !isOwner && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {available.length > 1 && (
              <select
                aria-label="Champ concerné"
                value={field}
                onChange={e => chooseField(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                {available.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
              </select>
            )}
            <select
              aria-label="Type de problème"
              value={kind}
              onChange={e => setKind(e.target.value as CorrectionKind)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            >
              {CORRECTION_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>

          <Textarea
            aria-label="Ce qui ne va pas"
            placeholder="Ce qui ne va pas"
            value={message}
            maxLength={MESSAGE_MAX}
            rows={2}
            onChange={e => setMessage(e.target.value)}
          />

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Correction proposée</p>
            {selected?.multiline ? (
              <Textarea
                aria-label="Correction proposée"
                value={suggestion}
                maxLength={SUGGESTION_MAX}
                rows={5}
                onChange={e => setSuggestion(e.target.value)}
              />
            ) : (
              <Input
                aria-label="Correction proposée"
                value={suggestion}
                maxLength={SUGGESTION_MAX}
                onChange={e => setSuggestion(e.target.value)}
              />
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setFormOpen(false); setError(null) }} disabled={busy}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {listOpen && corrections.length > 0 && (
        <ul className="space-y-2">
          {corrections.map(c => (
            <CorrectionItem
              key={c.id}
              correction={c}
              currentValue={currentOf(c.field)}
              userId={userId ?? null}
              isAdmin={isAdmin}
              onChanged={changed}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
