'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { saveVerse } from '@/lib/word-blocks-data'
import { type VerseWords, type LexSummary } from '@/lib/word-blocks'
import {
  afterSave, derive, initDraft, markSaved, reconcileDraft,
  staleVerseNumbers, toSave, unlinkedMarkers, verseStatus, type VerseDraft, type VerseStatus,
} from '@/lib/word-link-editor'
import { dialectForRegion } from '@/lib/lexicon-links'
import { BlockPanel } from './BlockPanel'
import { PairStrip, type Focus } from './PairStrip'

interface Props {
  resourceId: string
  /** The non-empty lines of the Bété and mot à mot fields, same count (see readiness). */
  beteLines: string[]
  literalLines: string[]
  saved: VerseWords[]
  region: string | null
  frenchLines: string[] | null
  signedIn: boolean
}

/** Colour code of a verse tab: colour AND a mark, so it never relies on colour alone. */
const STATUS: Record<VerseStatus, { tab: string; mark: string; markClass: string; label: string }> = {
  saved: { tab: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30', mark: '✓', markClass: 'text-emerald-600', label: 'enregistré' },
  modified: { tab: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30', mark: '●', markClass: 'text-amber-600', label: 'modifié, pas encore enregistré' },
  stale: { tab: 'border-orange-500 bg-orange-50 dark:bg-orange-950/30', mark: '⚠', markClass: 'text-orange-600', label: 'à revoir' },
  todo: { tab: 'border-border', mark: '', markClass: '', label: 'pas encore relié' },
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

export function WordLinkEditor({
  resourceId, beteLines, literalLines, saved, region, frenchLines, signedIn,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const initial = useMemo(
    () => beteLines.map((b, i) => initDraft(i + 1, b, literalLines[i] ?? '', saved.find(v => v.verse_no === i + 1))),
    [beteLines, literalLines, saved],
  )

  // Entries known to the editor (loaded with the saved verses, or created/linked here), by id.
  const savedEntries = useMemo(() => {
    const m: Record<string, LexSummary> = {}
    for (const v of saved) for (const b of v.blocks) if (b.lex) m[b.lex.id] = b.lex
    return m
  }, [saved])
  const [localEntries, setLocalEntries] = useState<Record<string, LexSummary>>({})
  const entries = { ...savedEntries, ...localEntries }

  const staleNos = useMemo(() => staleVerseNumbers(saved), [saved])
  const [savedNos, setSavedNos] = useState<number[]>([])
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
    const open = unlinkedMarkers(draft)
    if (open.length) {
      setStatus(s => ({ ...s, [cur]: `Reliez chaque marqueur grammatical à une entrée du lexique : ${open.join(', ')}.` }))
      return
    }

    setBusy(true)
    setStatus(s => ({ ...s, [cur]: '' }))
    const payload = toSave(draft)
    const res = await saveVerse(supabase, {
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
    setSavedNos(n => [...n, draft.verseNo])
    setStatus(s => ({ ...s, [cur]: 'Enregistré ✓' }))
    router.refresh()
  }

  // A verse is "saved" when the server holds links for it (or it was saved in this session), "à revoir" when its
  // saved links no longer match the text and nothing was redone since.
  const hasSavedNos = useMemo(() => new Set(saved.filter(v => !v.stale && v.blocks.length > 0).map(v => v.verse_no)), [saved])
  const statusOf = (d: VerseDraft, i: number): VerseStatus =>
    verseStatus({
      dirty: dirty(d, i),
      hasSaved: hasSavedNos.has(d.verseNo) || savedNos.includes(d.verseNo),
      stale: staleNos.includes(d.verseNo) && !savedNos.includes(d.verseNo),
    })
  const isStale = (d: VerseDraft, i: number) => statusOf(d, i) === 'stale'
  const anySaved = drafts.some((d, i) => statusOf(d, i) === 'saved')

  const unlinked = unlinkedMarkers(draft)

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
              STATUS[statusOf(d, i)].tab,
              cur === i && 'font-semibold ring-2 ring-primary/40',
            )}
          >
            Vers {d.verseNo}
            <span className="rounded-full border border-border px-1.5 text-[11px] tabular-nums text-muted-foreground">
              {derived[i].bu.length}/{derived[i].gu.length}
            </span>
            {STATUS[statusOf(d, i)].mark && (
              <span aria-hidden="true" className={STATUS[statusOf(d, i)].markClass}>{STATUS[statusOf(d, i)].mark}</span>
            )}
            <span className="sr-only">{STATUS[statusOf(d, i)].label}</span>
          </button>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Légende des couleurs">
        {(Object.keys(STATUS) as VerseStatus[]).map(k => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-sm border', STATUS[k].tab)} />
            {STATUS[k].mark && <span aria-hidden="true" className={STATUS[k].markClass}>{STATUS[k].mark}</span>}
            {STATUS[k].label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Les deux chiffres de chaque onglet : blocs bhété / blocs du mot à mot.</p>

      {isStale(draft, cur) && (
        <p className="text-sm text-amber-700">
          Le texte de ce vers a changé depuis son enregistrement : les anciens liens ne sont plus affichés aux lecteurs. Reliez-le de nouveau puis enregistrez.
        </p>
      )}

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

      <BlockPanel
        client={supabase}
        draft={draft}
        focus={focus}
        entries={entries}
        dialect={dialectForRegion(region)}
        example={frenchLines ? { bete: draft.bete, french: frenchLines[cur] ?? '', literal: draft.literal } : null}
        signedIn={signedIn}
        onEntry={e => setLocalEntries(m => ({ ...m, [e.id]: e }))}
        onChange={update}
        onFocus={setFocus}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !r.balanced || unlinked.length > 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer ce vers'}
        </button>
        {!r.balanced && <span className="text-xs text-muted-foreground">Disponible quand le vers est équilibré.</span>}
        {r.balanced && unlinked.length > 0 && (
          <span className="text-xs text-amber-700">Un marqueur n’est pas encore relié au lexique.</span>
        )}
        {status[cur] && (
          <span role="status" className={cn('text-sm', status[cur].startsWith('Enregistré') ? 'text-primary' : 'text-destructive')}>
            {status[cur]}
          </span>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <Link
          href={`/resources/${resourceId}`}
          className={cn(
            'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium',
            anySaved ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {anySaved ? 'Terminer et voir la ressource' : 'Passer cette étape'}
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          La ressource est déjà publiée. Vous pouvez revenir relier les mots à tout moment avec « Relier les mots ».
        </p>
      </div>
    </div>
  )
}
