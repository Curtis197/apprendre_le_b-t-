import type { DialectKey } from '@/lib/dialect'

export type SymbolGroup = 'voyelles' | 'trema' | 'consonnes' | 'marques'

export interface PhoneticSymbol {
  id: string
  group: SymbolGroup
  /** The standard form the picker inserts (always NFC). */
  glyph: string
  /** Capital, when it exists in this dialect. */
  upper?: string
  /** 'U+025B'. Absent for letter groups (bh, kp…), which are typed with the keyboard. */
  codePoint?: string
  /** A group of ordinary letters: shown on the page, not offered by the picker. */
  typable?: boolean
  /** Occurrences in this dialect's New Testament (corpus/). */
  frequency: number
  upperFrequency?: number
  /** null: « Note à venir ». */
  note: string | null
  noteNeedsReview?: boolean
  /** Empty until a speaker contributes: « Exemples à venir ». */
  examples: { bete: string; french: string }[]
}

export const SYMBOL_GROUPS: { id: SymbolGroup; title: string; hint: string }[] = [
  { id: 'voyelles', title: 'Voyelles', hint: 'Lettres absentes des claviers français' },
  { id: 'trema', title: 'Voyelles à tréma', hint: 'Une seule lettre, avec son tréma' },
  { id: 'consonnes', title: 'Consonnes', hint: 'Lettres et groupes de lettres' },
  { id: 'marques', title: 'Marques', hint: 'Tons, liaisons et signes propres au texte' },
]

const NOTE_E = 'Proche du « è » de mère.'
const NOTE_O = 'Proche du « o » de note.'
const NOTE_NG = 'Proche du « ng » de parking. Les autres dialectes l\'écrivent « ng ».'
const NOTE_APOS = 'Placée devant certains mots. La plus fréquente du texte.'
const NOTE_NBH = 'Trait d\'union insécable qui relie un petit mot au mot voisin.'
const NOTE_HY = 'Trait d\'union ordinaire qui relie un petit mot au mot voisin.'

const s = (
  id: string,
  group: SymbolGroup,
  glyph: string,
  frequency: number,
  extra: Partial<PhoneticSymbol> = {},
): PhoneticSymbol => ({
  id, group, glyph, frequency, note: null, examples: [],
  ...(/^[a-z]{2}$/.test(glyph) ? { typable: true } : { codePoint: 'U+' + glyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0') }),
  ...extra,
})

export const ALPHABET: Record<DialectKey, PhoneticSymbol[]> = {
  western: [
    s('e-open', 'voyelles', 'ɛ', 50714, { upper: 'Ɛ', upperFrequency: 529, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 36797, { upper: 'Ɔ', upperFrequency: 1403, note: NOTE_O, noteNeedsReview: true }),
    s('i-lax', 'voyelles', 'ɩ', 68529),
    s('u-lax', 'voyelles', 'ʋ', 31665),
    s('a-t', 'trema', 'ä', 35385),
    s('e-t', 'trema', 'ë', 11131),
    s('o-t', 'trema', 'ö', 23993),
    s('i-t', 'trema', 'ï', 3501),
    s('bh', 'consonnes', 'bh', 17795),
    s('ny', 'consonnes', 'ny', 11443),
    s('kp', 'consonnes', 'kp', 6140),
    s('gb', 'consonnes', 'gb', 4342),
    s('gl', 'consonnes', 'gl', 5534),
    s('apos', 'marques', "'", 78623, { note: NOTE_APOS, noteNeedsReview: true }),
    s('nbh', 'marques', '‑', 52175, { note: NOTE_NBH, noteNeedsReview: true }),
  ],
  eastern: [
    s('e-open', 'voyelles', 'ɛ', 33450, { upper: 'Ɛ', upperFrequency: 118, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 32152, { upper: 'Ɔ', upperFrequency: 1246, note: NOTE_O, noteNeedsReview: true }),
    s('i-lax', 'voyelles', 'ɩ', 52092, { upper: 'Ɩ', upperFrequency: 715 }),
    s('u-lax', 'voyelles', 'ʋ', 32596, { upper: 'Ʋ', upperFrequency: 70 }),
    s('e-t', 'trema', 'ë', 4375),
    s('o-t', 'trema', 'ö', 17876),
    s('i-t', 'trema', 'ï', 1945),
    s('bh', 'consonnes', 'bh', 21545),
    s('ny', 'consonnes', 'ny', 8285),
    s('kp', 'consonnes', 'kp', 5453),
    s('gb', 'consonnes', 'gb', 5933),
    s('gl', 'consonnes', 'gl', 5078),
    s('apos', 'marques', "'", 62855, { note: NOTE_APOS, noteNeedsReview: true }),
    s('hy', 'marques', '-', 80307, { note: NOTE_HY, noteNeedsReview: true }),
  ],
  northern: [
    s('e-open', 'voyelles', 'ɛ', 68059, { upper: 'Ɛ', upperFrequency: 1603, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 58236, { upper: 'Ɔ', upperFrequency: 1096, note: NOTE_O, noteNeedsReview: true }),
    s('eng', 'consonnes', 'ŋ', 2235, { upper: 'Ŋ', upperFrequency: 195, note: NOTE_NG, noteNeedsReview: true }),
    s('bh', 'consonnes', 'bh', 15569),
    s('ny', 'consonnes', 'ny', 15685),
    s('kp', 'consonnes', 'kp', 4981),
    s('gb', 'consonnes', 'gb', 6304),
    s('gl', 'consonnes', 'gl', 2190),
    s('apos', 'marques', "'", 73404, { note: NOTE_APOS, noteNeedsReview: true }),
    s('hy', 'marques', '-', 70921, { note: NOTE_HY, noteNeedsReview: true }),
    s('dq', 'marques', '"', 37415),
  ],
}

export function groupedSymbols(dialect: DialectKey) {
  return SYMBOL_GROUPS
    .map(g => ({ ...g, symbols: ALPHABET[dialect].filter(sym => sym.group === g.id) }))
    .filter(g => g.symbols.length > 0)
}

/** What the picker offers for a dialect, in two rows. Letter groups (bh, kp…) are typed, so they are left out. */
export function trayRows(dialect: DialectKey): { title: string; glyphs: string[] }[] {
  const glyphsOf = (groups: SymbolGroup[]) =>
    ALPHABET[dialect]
      .filter(sym => !sym.typable && groups.includes(sym.group))
      .flatMap(sym => [sym.glyph, ...(sym.upper && (sym.upperFrequency ?? 0) > 0 ? [sym.upper] : [])])
  return [
    { title: 'Voyelles', glyphs: glyphsOf(['voyelles', 'trema']) },
    { title: 'Autres', glyphs: glyphsOf(['consonnes', 'marques']) },
  ].filter(r => r.glyphs.length > 0)
}
