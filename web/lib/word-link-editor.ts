// lib/word-link-editor.ts — state of the word-linking editor for ONE verse, as pure functions.
// The React editor only calls these and renders the result; everything that can go wrong
// (re-keying notes when blocks merge, index remapping after a correction, the save payload) is here.
import {
  attachTo, autoGroup, blockKey, blockWords, buildUnits, contiguous, mapInsert, mapRemove, mapReplace,
  nonEmptyLines, pairUnits, remapAtt, remapKeys, splitRuns, splitWords,
  type BlockInput, type IndexMap, type Pair, type Side, type Unit, type VerseWords,
} from './word-blocks'
import { alignVerses, numberLines } from './verses'

export interface BlockMeta {
  isMarker: boolean
  solo: boolean
  note: string
  composition: string
  /** The lexicon entry and the sense (translation) this block uses. */
  lexiconId: string | null
  translationId: string | null
}

export const EMPTY_META: BlockMeta = { isMarker: false, solo: false, note: '', composition: '', lexiconId: null, translationId: null }

export interface VerseDraft {
  verseNo: number
  /** The lines the draft was built on: sent back so the database can refuse a save on moved text. */
  baseBete: string
  baseLiteral: string
  /** Current lines (corrected ones differ from the base). */
  bete: string
  literal: string
  /** Attachments: member word index -> head word index, per side. */
  attB: Record<number, number>
  attG: Record<number, number>
  /** Per Bété block, keyed by blockKey (word indices joined by "-"). */
  meta: Record<string, BlockMeta>
}

export interface Derived {
  bw: string[]
  gw: string[]
  bu: Unit[]
  gu: Unit[]
  pairs: Pair[]
  balanced: boolean
}

/** A draft from a verse's lines and, when the verse was saved and is not stale, its blocks. */
export function initDraft(
  verseNo: number,
  bete: string,
  literal: string,
  saved: VerseWords | undefined,
): VerseDraft {
  const base = { verseNo, baseBete: bete, baseLiteral: literal, bete, literal }
  if (!saved || saved.stale || saved.blocks.length === 0) {
    return { ...base, attB: {}, attG: autoGroup(splitWords(literal)), meta: {} }
  }
  const attB: Record<number, number> = {}
  const attG: Record<number, number> = {}
  const meta: Record<string, BlockMeta> = {}
  for (const b of saved.blocks) {
    b.bete_idx.slice(1).forEach(i => (attB[i] = b.bete_idx[0]))
    b.gloss_idx.slice(1).forEach(i => (attG[i] = b.gloss_idx[0]))
    meta[b.bete_idx.join('-')] = {
      isMarker: b.is_marker,
      solo: b.solo,
      note: b.note ?? '',
      composition: b.composition ?? '',
      lexiconId: b.lex?.id ?? null,
      translationId: b.lex?.senseId ?? null,
    }
  }
  return { ...base, attB, attG, meta }
}

export const unitMeta = (d: VerseDraft, u: Unit): BlockMeta => d.meta[blockKey(u)] ?? EMPTY_META

export function derive(d: VerseDraft): Derived {
  const bw = splitWords(d.bete)
  const gw = splitWords(d.literal)
  const bu = buildUnits(bw, d.attB)
  const gu = buildUnits(gw, d.attG)
  const solo = new Set(bu.filter(u => d.meta[blockKey(u)]?.solo).map(blockKey))
  const pairs = pairUnits(bu, gu, solo)
  const balanced = bw.length > 0 && gw.length > 0 && bu.length - solo.size === gu.length
  return { bw, gw, bu, gu, pairs, balanced }
}

/** Notes, markers and compositions follow the block that contains their first word. */
function rekeyMeta(before: Unit[], after: Unit[], meta: Record<string, BlockMeta>): Record<string, BlockMeta> {
  // Only the block that keeps an old block's FIRST word inherits its meta (no copy on a split).
  const firstWordKey = new Map(before.map(u => [u.idx[0], blockKey(u)] as const))
  const out: Record<string, BlockMeta> = {}
  for (const u of after) {
    const old = firstWordKey.get(u.idx[0])
    const m = old != null ? meta[old] : undefined
    if (m) out[blockKey(u)] = m
  }
  return out
}

/** Attach the unit headed by `from` to the unit headed by `to`. */
export function attachUnits(d: VerseDraft, side: Side, from: number, to: number): VerseDraft {
  if (side === 'g') return { ...d, attG: attachTo(d.attG, from, to) }
  const bw = splitWords(d.bete)
  const before = buildUnits(bw, d.attB)
  const attB = attachTo(d.attB, from, to)
  return { ...d, attB, meta: rekeyMeta(before, buildUnits(bw, attB), d.meta) }
}

/** Undo the grouping of the unit headed by `head`. */
export function splitUnit(d: VerseDraft, side: Side, head: number): VerseDraft {
  const without = (att: Record<number, number>) => {
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(att)) if (v !== head) out[Number(k)] = v
    return out
  }
  if (side === 'g') return { ...d, attG: without(d.attG) }
  const bw = splitWords(d.bete)
  const before = buildUnits(bw, d.attB)
  const attB = without(d.attB)
  return { ...d, attB, meta: rekeyMeta(before, buildUnits(bw, attB), d.meta) }
}

export function setMeta(d: VerseDraft, key: string, patch: Partial<BlockMeta>): VerseDraft {
  return { ...d, meta: { ...d.meta, [key]: { ...(d.meta[key] ?? EMPTY_META), ...patch } } }
}

/**
 * Word or grammatical marker. A marker may be flagged `solo` (no mot à mot counterpart).
 * Changing the kind drops the link: a word entry does not fit a marker block and the reverse.
 */
export function setKind(d: VerseDraft, key: string, kind: 'word' | 'marker', solo: boolean): VerseDraft {
  const cur = d.meta[key] ?? EMPTY_META
  if (kind === 'marker') {
    return setMeta(d, key, cur.isMarker ? { solo } : { isMarker: true, solo, lexiconId: null, translationId: null })
  }
  return setMeta(d, key, cur.isMarker ? { isMarker: false, solo: false, lexiconId: null, translationId: null } : { isMarker: false, solo: false })
}

/** Link (or unlink with nulls) the block `key` to a lexicon entry and one of its senses. */
export function setLink(d: VerseDraft, key: string, lexiconId: string | null, translationId: string | null): VerseDraft {
  return setMeta(d, key, { lexiconId, translationId: lexiconId ? translationId : null })
}

/** The words of the marker blocks that still have no lexicon entry (the database refuses them). */
export function unlinkedMarkers(d: VerseDraft): string[] {
  const { bw, bu } = derive(d)
  return bu
    .filter(u => d.meta[blockKey(u)]?.isMarker && !d.meta[blockKey(u)]?.lexiconId)
    .map(u => blockWords(bw, u.idx))
}

/** Numbers of the verses saved blocks no longer match (their text changed elsewhere). */
export function staleVerseNumbers(saved: VerseWords[]): number[] {
  return saved.filter(v => v.stale === true).map(v => v.verse_no)
}

// ── Text corrections: the links, notes and markers follow the words ─────────────────────────────

function applyTextEdit(d: VerseDraft, side: Side, words: string[], f: IndexMap): VerseDraft {
  if (side === 'b') {
    const bete = words.join(' ')
    const attB = remapAtt(d.attB, f)
    // Drop meta keys that no longer match a block (e.g. the head word was removed).
    const keys = new Set(buildUnits(splitWords(bete), attB).map(blockKey))
    const meta: Record<string, BlockMeta> = {}
    for (const [k, m] of Object.entries(remapKeys(d.meta, f))) if (keys.has(k)) meta[k] = m
    return { ...d, bete, attB, meta }
  }
  return { ...d, literal: words.join(' '), attG: remapAtt(d.attG, f) }
}

const wordsOf = (d: VerseDraft, side: Side) => splitWords(side === 'b' ? d.bete : d.literal)

/**
 * Replace the words of a unit. Words side by side can become any number of words (merge or split);
 * words that are apart keep their count.
 */
export function editWords(
  d: VerseDraft,
  side: Side,
  unit: Unit,
  newWords: string[],
): { draft: VerseDraft } | { error: string } {
  if (newWords.length === 0) return { error: 'Écrivez au moins un mot, ou utilisez « Supprimer ».' }
  const words = wordsOf(d, side)
  if (!contiguous(unit.idx)) {
    if (newWords.length !== unit.idx.length) {
      return { error: 'Ces mots ne sont pas côte à côte : gardez le même nombre de mots.' }
    }
    const next = words.slice()
    unit.idx.forEach((ix, k) => (next[ix] = newWords[k]))
    return { draft: applyTextEdit(d, side, next, i => i) }
  }
  const next = words.slice()
  next.splice(unit.idx[0], unit.idx.length, ...newWords)
  return { draft: applyTextEdit(d, side, next, mapReplace(unit.idx, newWords.length)) }
}

export function addWords(d: VerseDraft, side: Side, pos: number, newWords: string[]): VerseDraft {
  const next = wordsOf(d, side).slice()
  next.splice(pos, 0, ...newWords)
  return applyTextEdit(d, side, next, mapInsert(pos, newWords.length))
}

export function removeWord(d: VerseDraft, side: Side, at: number): VerseDraft {
  const next = wordsOf(d, side).filter((_, i) => i !== at)
  return applyTextEdit(d, side, next, mapRemove(at))
}

// ── Saving ──────────────────────────────────────────────────────────────────────────────────────

export interface SavePayload {
  /** Corrected line, or null when it is the one the draft was built on. */
  beteLine: string | null
  literalLine: string | null
  blocks: BlockInput[]
}

export function toSave(d: VerseDraft): SavePayload {
  const { pairs } = derive(d)
  const blocks: BlockInput[] = pairs
    .filter((p): p is Pair & { b: Unit } => p.b != null && (p.g != null || p.solo === true))
    .map(p => {
      const m = d.meta[blockKey(p.b)] ?? EMPTY_META
      return {
        bete_idx: p.b.idx,
        gloss_idx: p.g ? p.g.idx : [],
        is_marker: m.isMarker,
        solo: m.solo,
        note: m.note.trim() || null,
        composition: m.composition.trim() || null,
        lexicon_id: m.lexiconId ?? null,
        translation_id: m.translationId ?? null,
      }
    })
  return {
    beteLine: d.bete !== d.baseBete ? d.bete : null,
    literalLine: d.literal !== d.baseLiteral ? d.literal : null,
    blocks,
  }
}

/** After a successful save the current lines become the base the next save is checked against. */
export const markSaved = (d: VerseDraft): VerseDraft => ({ ...d, baseBete: d.bete, baseLiteral: d.literal })

/** After a save: the lines that were sent become the base; edits typed meanwhile stay as they are. */
export function afterSave(current: VerseDraft, sent: VerseDraft): VerseDraft {
  return { ...current, baseBete: sent.bete, baseLiteral: sent.literal }
}

/** When the server sends new props: which draft a verse should show. In-memory unsaved edits win,
 *  then a stored draft built on the same text, else the server's version. */
export function reconcileDraft(
  initial: VerseDraft,
  current: VerseDraft | undefined,
  currentBaseline: string | undefined,
  stored: VerseDraft | null,
): VerseDraft {
  const sameBase = (d: VerseDraft) => d.baseBete === initial.baseBete && d.baseLiteral === initial.baseLiteral
  if (current && currentBaseline !== undefined && JSON.stringify(current) !== currentBaseline && sameBase(current)) return current
  if (stored && sameBase(stored)) return { ...initial, ...stored }
  return initial
}

// ── Can this resource be linked? ────────────────────────────────────────────────────────────────

export type Readiness =
  | { ok: true; verses: number }
  | { ok: false; reason: 'no_bete' | 'no_literal' | 'line_count' | 'odd_whitespace'; bete: number; literal: number }

export function readiness(bete: string, literal: string | null): Readiness {
  const b = nonEmptyLines(bete).length
  const l = literal ? nonEmptyLines(literal).length : 0
  if (b === 0) return { ok: false, reason: 'no_bete', bete: b, literal: l }
  if (l === 0) return { ok: false, reason: 'no_literal', bete: b, literal: l }
  // The reader and the gutter number lines with trim(), which also strips NBSP and other Unicode spaces.
  const numbered = (t: string) => numberLines(t).filter(n => n != null).length
  if (b !== numbered(bete) || l !== numbered(literal ?? '')) return { ok: false, reason: 'odd_whitespace', bete: b, literal: l }
  if (b !== l) return { ok: false, reason: 'line_count', bete: b, literal: l }
  return { ok: true, verses: b }
}

export function readinessMessage(r: Readiness): string {
  if (r.ok) return ''
  if (r.reason === 'no_bete') return "Cette ressource n'a pas de texte en bhété."
  if (r.reason === 'no_literal') {
    return 'Pour relier les mots, ajoutez d’abord le mot à mot (la traduction exacte, mot par mot) dans « Modifier la ressource ».'
  }
  if (r.reason === 'odd_whitespace') {
    return 'Une ligne ne contient que des espaces spéciaux (espace insécable…) : supprimez-la ou remplacez-la dans « Modifier la ressource », sinon les numéros de vers ne correspondent plus.'
  }
  return `Le texte bhété a ${r.bete} lignes et le mot à mot a ${r.literal} lignes : il faut le même nombre de lignes dans les deux champs (un vers par ligne). Corrigez-le dans « Modifier la ressource ».`
}

// ── The strip of pairs, in sentence order ───────────────────────────────────────────────────────

export interface Cell {
  key: string
  /** Index of the pair in `pairs` (the block number minus one). */
  pairIndex: number
  pair: Pair
  /** 0 for the first place of the block, 1+ for its partner places (words apart). */
  run: number
  /** Text of every place of the block. */
  runs: string[]
  /** Text of this place. */
  text: string
}

/** One cell per word place: a block with separated words gets a cell at each of its places. */
export function buildCells(pairs: Pair[], bw: string[]): Cell[] {
  const cells: (Cell & { start: number })[] = []
  pairs.forEach((pair, pairIndex) => {
    if (!pair.b) {
      cells.push({ key: `g${pairIndex}`, pairIndex, pair, run: 0, runs: [], text: '', start: 1e6 + pairIndex })
      return
    }
    const runs = splitRuns(pair.b.idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    runs.forEach((r, run) =>
      cells.push({ key: `${pairIndex}.${run}`, pairIndex, pair, run, runs: names, text: names[run], start: r[0] }),
    )
  })
  return cells.sort((a, b) => a.start - b.start)
}

// ── Will readers see the words? ─────────────────────────────────────────────────────────────────

/** Readers get word blocks only when the three fields line up verse by verse (one verse per line). */
export function readerWillShowWords(
  bete: string,
  literal: string | null,
  french: string | null,
): { ok: true } | { ok: false; message: string } {
  const a = alignVerses(bete, literal, french)
  if (a.kind === 'single' || (a.kind === 'verses' && a.unit === 'line')) return { ok: true }
  if (a.kind === 'verses') {
    return {
      ok: false,
      message:
        'Ce texte est découpé en phrases à l’affichage : les mots ne s’afficheront pas pour les lecteurs. Mettez un vers par ligne dans « Modifier la ressource ».',
    }
  }
  return {
    ok: false,
    message:
      'Le bhété, le mot à mot et le français ne s’alignent pas vers par vers (même nombre de couplets et de lignes dans les trois champs) : les lecteurs ne verront pas les mots tant que ce n’est pas corrigé. Corrigez-le dans « Modifier la ressource ».',
  }
}

// ── Colour code of a verse tab ──────────────────────────────────────────────────────────────────

/** saved: linked and saved · modified: unsaved changes · stale (à revoir): text changed since saving · todo: nothing saved. */
export type VerseStatus = 'saved' | 'modified' | 'stale' | 'todo'

/**
 * One status per verse tab. Unsaved changes always win; a verse whose saved links no longer match
 * its text is "stale" even if it has saved blocks; otherwise it is saved or not yet linked.
 */
export function verseStatus(o: { dirty: boolean; hasSaved: boolean; stale: boolean }): VerseStatus {
  if (o.dirty) return 'modified'
  if (o.stale) return 'stale'
  return o.hasSaved ? 'saved' : 'todo'
}

// ── Steps of publishing ─────────────────────────────────────────────────────────────────────────

/**
 * What the text form does after saving: `view` goes to the resource, `link` to step 2 (the linking
 * page explains what to fix if the text is not ready), `link-if-ready` to step 2 only when the
 * mot à mot lines up with the text (a new resource without mot à mot just opens).
 */
export type PostSaveIntent = 'view' | 'link' | 'link-if-ready'

export function postSaveDestination(id: string, bete: string, literal: string | null, intent: PostSaveIntent): string {
  const view = `/resources/${id}`
  if (intent === 'view') return view
  if (intent === 'link') return `${view}/relier`
  return readiness(bete, literal).ok ? `${view}/relier` : view
}
