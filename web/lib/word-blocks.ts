// lib/word-blocks.ts — pure helpers for the word-by-word layer of resources.
// No React, no Supabase: everything here is unit tested. Words are split exactly like the SQL
// functions word_count / block_words (migration 20261006000000_resource_word_links.sql):
// on runs of space, tab and U+00A0; hyphens and apostrophes stay inside a word.

export type Side = 'b' | 'g'

/** A set of words of one side that read as one: the head word plus the words attached to it. */
export interface Unit {
  head: number
  idx: number[]
}

/** A Bété unit paired with a mot à mot unit. `solo`: a marker with no mot à mot counterpart. */
export interface Pair {
  b: Unit | null
  g: Unit | null
  solo?: boolean
}

/** Maps an old word index to its new index, or null when the word no longer exists. */
export type IndexMap = (i: number) => number | null

export interface MarkerInfo {
  type: string | null
  meaning: string | null
  french: string | null
}

/** One block as returned by get_resource_words. */
export interface WordBlock {
  position: number
  bete_idx: number[]
  gloss_idx: number[]
  is_marker: boolean
  solo: boolean
  note: string | null
  composition: string | null
  marker: MarkerInfo | null
}

/** One verse with its blocks, as returned by get_resource_words. */
export interface VerseWords {
  verse_no: number
  stale: boolean
  bete_line: string
  literal_line: string
  blocks: WordBlock[]
}

/** One block as sent to save_resource_verse. */
export interface BlockInput {
  bete_idx: number[]
  gloss_idx: number[]
  is_marker: boolean
  solo: boolean
  note: string | null
  composition: string | null
  marker?: { type: string; meaning: string; french: string }
}

const EDGE = /^[ \t\u00A0]+|[ \t\u00A0]+$/g
const SEP = /[ \t\u00A0]+/

export function splitWords(line: string): string[] {
  const t = line.replace(EDGE, '')
  return t === '' ? [] : t.split(SEP)
}

/**
 * The non-empty lines of a text, trimmed of spaces and tabs only (like the SQL function
 * verse_line), so "verse n" is the same line here, in the gutter and in the database.
 */
export function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.replace(/^[ \t]+|[ \t]+$/g, ''))
    .filter(l => l !== '')
}

/** Key under which a marker's meaning is shared. Same result as SQL usage_token_norm for ordinary words. */
export function normWord(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F''ʼ\u2019\u2010-]/g, '')
}

const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'au', 'aux', 'du'])

/**
 * Bété has no articles: a French article sticks to the word after it ("les gens", "au ciel").
 * Returns the attachment map (member index -> head index). "de" is deliberately absent: it can be
 * a real Bété word.
 */
export function autoGroup(words: string[]): Record<number, number> {
  const att: Record<number, number> = {}
  for (let i = words.length - 2; i >= 0; i--) {
    if (ARTICLES.has(words[i].toLowerCase())) att[i] = att[i + 1] ?? i + 1
  }
  return att
}

/** Units of a line: every word is a unit of its own unless it is attached to a head word. */
export function buildUnits(words: string[], att: Record<number, number>): Unit[] {
  const ok = (i: number) => att[i] != null && att[i] < words.length && att[i] !== i && att[att[i]] == null
  const all = words.map((_, i) => i)
  return all
    .filter(i => !ok(i))
    .map(head => ({ head, idx: all.filter(i => i === head || (ok(i) && att[i] === head)) }))
    .sort((a, b) => a.idx[0] - b.idx[0])
}

/** Attach word `from` (and the words attached to it) to head `to`. */
export function attachTo(att: Record<number, number>, from: number, to: number): Record<number, number> {
  const next = { ...att, [from]: to }
  for (const k of Object.keys(next)) if (next[Number(k)] === from) next[Number(k)] = to
  return next
}

export const blockKey = (u: Unit): string => u.idx.join('-')

export const contiguous = (idx: number[]): boolean => idx.every((v, k) => k === 0 || v === idx[k - 1] + 1)

/** Consecutive runs of word indices: [2, 9, 10] -> [[2], [9, 10]]. */
export function splitRuns(idx: number[]): number[][] {
  const runs: number[][] = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && i === last[last.length - 1] + 1) last.push(i)
    else runs.push([i])
  }
  return runs
}

/** The words of a block joined by a space (what the database stores as the marker key source). */
export const blockWords = (words: string[], idx: number[]): string => idx.map(i => words[i] ?? '').join(' ')

/** The words of a block for display: "tatini … yii" when they are not side by side. */
export const labelOf = (words: string[], idx: number[]): string =>
  idx.map(i => words[i] ?? '').join(contiguous(idx) ? ' ' : ' … ')

/**
 * The k-th Bété unit is paired with the k-th mot à mot unit. Units flagged solo (markers with no
 * counterpart) are set aside and kept in sentence order. `soloKeys` holds `blockKey` values.
 */
export function pairUnits(bu: Unit[], gu: Unit[], soloKeys: ReadonlySet<string>): Pair[] {
  const isSolo = (u: Unit) => soloKeys.has(blockKey(u))
  const pu = bu.filter(u => !isSolo(u))
  const n = Math.max(pu.length, gu.length)
  const pairs: Pair[] = [
    ...Array.from({ length: n }, (_, k): Pair => ({ b: pu[k] ?? null, g: gu[k] ?? null })),
    ...bu.filter(isSolo).map((u): Pair => ({ b: u, g: null, solo: true })),
  ]
  return pairs.sort((a, b) => (a.b ? a.b.idx[0] : 1e6) - (b.b ? b.b.idx[0] : 1e6))
}

// ── Index remapping after a text correction ─────────────────────────────────────────────────────

export function remapAtt(att: Record<number, number>, f: IndexMap): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(att)) {
    const nk = f(Number(k))
    const nv = f(Number(v))
    if (nk != null && nv != null && nk !== nv) out[nk] = nv
  }
  return out
}

/** Block keys are Bété word indices joined by "-". Returns null when none of its words survives. */
export function remapBlockKey(key: string, f: IndexMap): string | null {
  const ids = key
    .split('-')
    .map(Number)
    .map(f)
    .filter((x): x is number => x != null)
  return ids.length ? ids.join('-') : null
}

export function remapKeys<T>(o: Record<string, T>, f: IndexMap): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(o)) {
    const nk = remapBlockKey(k, f)
    if (nk) out[nk] = v
  }
  return out
}

/** The words `idx` (side by side) are replaced by `newLen` words. */
export const mapReplace =
  (idx: number[], newLen: number): IndexMap =>
  i => {
    const start = idx[0]
    const end = idx[idx.length - 1]
    const delta = newLen - idx.length
    if (i < start) return i
    if (i <= end) return i - start < newLen ? i : null
    return i + delta
  }

/** `n` words are inserted before position `pos`. */
export const mapInsert =
  (pos: number, n: number): IndexMap =>
  i =>
    i >= pos ? i + n : i

/** The word at `at` is removed. */
export const mapRemove =
  (at: number): IndexMap =>
  i =>
    i === at ? null : i > at ? i - 1 : i

// ── Reader tokens ───────────────────────────────────────────────────────────────────────────────

export interface ReaderToken {
  /** First word index of this piece in the Bété line. */
  start: number
  /** Piece number inside its block (0 = first piece). */
  k: number
  /** Text of every piece of the block, in order. */
  runs: string[]
  /** Shared by the pieces of one block. */
  bid: string
  /** Text of this piece. */
  t: string
  /** Text of the whole block: "tatini … yii" when its words are apart. */
  whole: string
  gloss: string | null
  note: string | null
  composition: string | null
  isMarker: boolean
  solo: boolean
  marker: MarkerInfo | null
}

/**
 * One token per word place, in the original sentence order. A block whose words are apart gives
 * several tokens sharing the same `bid`, so the reader can link them. The text is never rewritten.
 */
export function readerTokens(verse: VerseWords): ReaderToken[] {
  const bw = splitWords(verse.bete_line)
  const gw = splitWords(verse.literal_line)
  const out: ReaderToken[] = []
  for (const b of verse.blocks) {
    const runs = splitRuns(b.bete_idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    runs.forEach((r, k) =>
      out.push({
        start: r[0],
        k,
        runs: names,
        bid: `${verse.verse_no}:${b.position}`,
        t: names[k],
        whole: labelOf(bw, b.bete_idx),
        gloss: b.gloss_idx.length ? labelOf(gw, b.gloss_idx) : null,
        note: b.note,
        composition: b.composition,
        isMarker: b.is_marker,
        solo: b.solo,
        marker: b.marker,
      }),
    )
  }
  return out.sort((a, b) => a.start - b.start)
}
