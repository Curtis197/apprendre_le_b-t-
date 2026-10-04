// lib/lexicon-links.ts — pure helpers for linking word blocks to lexicon entries.
// No React, no Supabase. Unit tested.
import { checkDescription, checkTranslationInput } from './lexicon'
import type { LexSummary } from './word-blocks'

const WS = '[ \\t\\u00a0]'
// French articles stick to the word after them ("au ciel"); "l'" too. "de" is deliberately absent.
const ARTICLE = new RegExp(`^(?:l['\\u2019]|(?:le|la|les|un|une|des|au|aux|du)${WS}+)`, 'i')
const EDGE = new RegExp(`^${WS}+|${WS}+$`, 'g')

/** "au ciel" -> "ciel". A lone article is kept. */
export function stripArticle(gloss: string): string {
  const t = gloss.replace(EDGE, '')
  const rest = t.replace(ARTICLE, '').replace(new RegExp(`^${WS}+`), '')
  return rest === '' ? t : rest
}

/** The French word proposed for a new entry's first sense. */
export const senseSeed = (gloss: string): string => stripArticle(gloss)

export type Dialect = 'western' | 'northern' | 'eastern'

export const DIALECTS: { value: Dialect; label: string }[] = [
  { value: 'western', label: 'Ouest (Guiberoua)' },
  { value: 'northern', label: 'Nord (Gagnoa)' },
  { value: 'eastern', label: 'Est (Daloa)' },
]

/** Default dialect of a new entry, from the region of the resource. Always editable. */
export function dialectForRegion(region: string | null | undefined): Dialect {
  if (region === 'Gagnoa') return 'northern'
  if (region === 'Daloa') return 'eastern'
  return 'western'
}

/** Part-of-speech tags are the ones already stored in lexicon.pos (see LexiconEntry POS_LABELS) plus 'part'. */
export const ENTRY_CATEGORIES: { value: string; label: string }[] = [
  { value: 'noun', label: 'Nom' },
  { value: 'verb', label: 'Verbe' },
  { value: 'adj', label: 'Adjectif' },
  { value: 'adv', label: 'Adverbe' },
  { value: 'name', label: 'Nom propre' },
  { value: 'num', label: 'Numéral' },
  { value: 'pron', label: 'Pronom' },
  { value: 'prep', label: 'Préposition' },
  { value: 'conj', label: 'Conjonction' },
  { value: 'interj', label: 'Interjection' },
  { value: 'part', label: 'Particule' },
]

export interface Candidate {
  matchKind: 'exact' | 'norm' | 'near'
  /** The form that matched (a spelling, the IPA, or an extra spelling). */
  matched: string
  distance: number
  entry: LexSummary
}

export interface GroupedCandidates {
  /** Same spelling, wanted kind. */
  exact: Candidate[]
  /** Spelled differently (accents, tones, small typos), wanted kind. */
  variants: Candidate[]
  /** Entries of the other kind: the panel says so and never links them silently. */
  otherKind: Candidate[]
}

export function groupCandidates(rows: Candidate[], kind: 'word' | 'marker'): GroupedCandidates {
  const g: GroupedCandidates = { exact: [], variants: [], otherKind: [] }
  for (const c of rows) {
    if (c.entry.kind !== kind) g.otherKind.push(c)
    else if (c.matchKind === 'exact') g.exact.push(c)
    else g.variants.push(c)
  }
  return g
}

export interface EntryForm {
  spelling: string
  ipa: string
  dialect: Dialect
  /** A pos tag from ENTRY_CATEGORIES, or ''. */
  category: string
  description: string
  notes: string
  /** Comma or semicolon separated. */
  synonyms: string
  lemma: string
  senses: { french: string; context: string }[]
  /** Use the verse as an example sentence (needs the French line). */
  useExample: boolean
}

export function emptyEntryForm(spelling: string, gloss: string, dialect: Dialect): EntryForm {
  return {
    spelling, ipa: '', dialect, category: '', description: '', notes: '', synonyms: '', lemma: '',
    senses: [{ french: senseSeed(gloss), context: '' }], useExample: false,
  }
}

export const splitList = (s: string): string[] =>
  s.split(/[,;]/).map(x => x.trim()).filter(Boolean)

/** A French error message, or null when the form can be sent. */
export function checkEntryForm(f: EntryForm, kind: 'word' | 'marker'): string | null {
  const spelling = f.spelling.trim()
  if (!spelling) return 'Écrivez la graphie du mot.'
  if (spelling.length > 100) return 'La graphie ne peut pas dépasser 100 caractères.'
  if (f.ipa.trim().length > 100) return 'La transcription ne peut pas dépasser 100 caractères.'
  if (kind === 'word') {
    const filled = f.senses.filter(s => s.french.trim() !== '')
    if (filled.length === 0) return 'Ajoutez au moins un sens (le mot en français).'
    for (const s of filled) {
      const c = checkTranslationInput({ french: s.french, context: s.context })
      if (c.error) return c.error
    }
  }
  return checkDescription(f.description).error
}
