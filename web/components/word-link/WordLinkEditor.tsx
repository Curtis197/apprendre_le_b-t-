'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { saveVerse } from '@/lib/word-blocks-data'
import { type VerseWords } from '@/lib/word-blocks'
import { afterSave, collectMarkers, derive, initDraft, markSaved, reconcileDraft, toSave, type VerseDraft } from '@/lib/word-link-editor'
import { BlockPanel } from './BlockPanel'
import { PairStrip, type Focus } from './PairStrip'

interface Props {
  resourceId: string
  /** The non-empty lines of the Bété and mot à mot fields, same count (see readiness). */
  beteLines: string[]
  literalLines: string[]
  saved: VerseWords[]
}

const draftKey = (resourceId: string, verseNo: number) => `word-links:${resourceId}:${verseNo}`

/** A draft kept in this browser until the verse is saved; null if none or storage is unavailable. */
function readStored(resourceId: string, verseNo: number): VerseDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(resourceId, verseNo))
    return raw ? (JSON.parse(raw) as VerseDraft) : null
  } catch {
    return null
  }
}

export function WordLinkEditor({ resourceId, beteLines, literalLines, saved }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const initial = useMemo(() => {
    const markers = collectMarkers(saved)
    return beteLines.map((b, i) =>
      initDraft(i + 1, b, literalLines[i] ?? '', saved.find(v => v.verse_no === i + 1), markers),
    )
  }, [beteLines, literalLines, saved])
  const [drafts, setDrafts] = useState<VerseDraft[]>(initial)
  // What each verse looked like when it was loaded or last saved: a verse is "modified" when it differs.
  const [baseline, setBaseline] = useState<string[]>(() => initial.map(d => JSON.stringify(d)))
  const [cur, setCur] = useState(0)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [status, setStatus] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)

  const draftsRef = useRef(drafts)
  const baselineRef = useRef(baseline)
  useEffect(() => {
    draftsRef.current = drafts
    baselineRef.current = baseline
  })

  // Restore the drafts kept in this browser (after hydration, so the first render matches the server).
  useEffect(() => {
    const next = initial.map((d, i) =>
      reconcileDraft(d, draftsRef.current[i], baselineRef.current[i], readStored(resourceId, d.verseNo)),
    )
    setDrafts(next)
    setBaseline(initial.map(d => JSON.stringify(d)))
    setRestored(true)
  }, [initial, resourceId])

  const dirty = (d: VerseDraft, i: number) => JSON.stringify(d) !== baseline[i]

  // Keep the draft of a verse in this browser while it is not saved.
  useEffect(() => {
    if (!restored) return
    drafts.forEach((d, i) => {
      try {
        if (dirty(d, i)) localStorage.setItem(draftKey(resourceId, d.verseNo), JSON.stringify(d))
        else localStorage.removeItem(draftKey(resourceId, d.verseNo))
      } catch {
        // storage unavailable: the page still works, the draft is just not kept
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, restored])

  useEffect(() => {
    const anyDirty = drafts.some((d, i) => dirty(d, i))
    if (!anyDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const derived = drafts.map(derive)
  const draft = drafts[cur]
  const r = derived[cur]
  const update = (d: VerseDraft) => setDrafts(ds => ds.map((x, i) => (i === cur ? d : x)))

  async function save() {
    setBusy(true)
    setStatus(s => ({ ...s, [cur]: '' }))
    const payload = toSave(draft)
    const res = await saveVerse(supabaseRef.current, {
      resourceId,
      verseNo: draft.verseNo,
      baseBete: draft.baseBete,
      baseLiteral: draft.baseLiteral,
      beteLine: payload.beteLine,
      literalLine: payload.literalLine,
      blocks: payload.blocks,
    })
    setBusy(false)
    if (res.error) {
      setStatus(s => ({ ...s, [cur]: res.error }))
      return
    }
    try {
      localStorage.removeItem(draftKey(resourceId, draft.verseNo))
    } catch {
      // ignore
    }
    const savedDraft = markSaved(draft)
    setDrafts(ds => ds.map((x, i) => (i === cur ? afterSave(x, draft) : x)))
    setBaseline(b => b.map((x, i) => (i === cur ? JSON.stringify(savedDraft) : x)))
    setStatus(s => ({ ...s, [cur]: 'Enregistré ✓' }))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Vers">
        {drafts.map((d, i) => (
          <button
            key={d.verseNo}
            type="button"
            role="tab"
            aria-selected={cur === i}
            onClick={() => { setCur(i); setFocus(null) }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
              cur === i ? 'border-primary bg-primary/10' : 'border-border',
            )}
          >
            Vers {d.verseNo}
            <span className={cn('rounded-full border px-1.5 text-[11px] tabular-nums', derived[i].balanced ? 'border-primary text-primary' : 'border-amber-500 text-amber-700')}>
              {derived[i].bu.length}/{derived[i].gu.length}
            </span>
            {dirty(d, i) && <span aria-label="modifié" className="text-amber-600">●</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Dans chaque onglet : blocs bhété / blocs du mot à mot. Un point ● signale un vers modifié et pas encore enregistré.</p>

      <div className="space-y-1 border-l-2 border-border pl-3">
        <p className="font-semibold">{draft.bete}</p>
      </div>

      {!r.balanced && (
        <p className="text-sm text-amber-700">
          Il manque des regroupements : chaque mot bhété doit être dans un bloc, et chaque mot du mot à mot aussi
          (ou le mot est un marqueur sans mot correspondant).
        </p>
      )}

      <PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={draft.meta} focus={focus} onFocus={setFocus} />

      <BlockPanel draft={draft} focus={focus} onChange={update} onFocus={setFocus} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !r.balanced}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer ce vers'}
        </button>
        {!r.balanced && <span className="text-xs text-muted-foreground">Disponible quand le vers est équilibré.</span>}
        {status[cur] && (
          <span role="status" className={cn('text-sm', status[cur].startsWith('Enregistré') ? 'text-primary' : 'text-destructive')}>
            {status[cur]}
          </span>
        )}
      </div>
    </div>
  )
}
