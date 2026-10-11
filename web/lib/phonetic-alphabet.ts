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
  /** Where the note comes from (shown next to it). */
  noteSource?: string
  noteNeedsReview?: boolean
  /** Empty until a speaker contributes: « Exemples à venir ». */
  examples: { bete: string; french: string }[]
}

export const SYMBOL_GROUPS: { id: SymbolGroup; title: string; hint: string }[] = [
  { id: 'voyelles', title: 'Voyelles', hint: 'Lettres absentes des claviers français' },
  { id: 'trema', title: 'Voyelles à tréma', hint: 'Une seule lettre, avec son tréma' },
  { id: 'consonnes', title: 'Consonnes', hint: 'Lettres et groupes de lettres' },
  { id: 'marques', title: 'Marques', hint: 'Tons et signes propres au texte' },
]

// Sources of the notes. None of them has been checked by a Bhété speaker yet (every note is flagged for review).
// Godié is a neighbouring Kru language written in the same ILA practical orthography as the Bhété corpus.
const SRC_GODIE = 'Orthographe du godié, langue voisine (Egner 2015), et Zogbo 2019'
const SRC_KRU = 'Zogbo 2019 (voyelles des langues kru)'
const SRC_IA = 'Brouillon rédigé par une IA, non vérifié'

const NOTE_E = 'Voyelle mi-ouverte antérieure, relâchée (−ATR) : proche du « è » de père.'
const NOTE_O = 'Voyelle mi-ouverte postérieure arrondie, relâchée (−ATR) : proche du « o » de porte.'
const NOTE_I = 'Voyelle haute antérieure, relâchée (−ATR) : un « i » plus détendu, comme le « i » de l’anglais bit.'
const NOTE_U = 'Voyelle haute postérieure arrondie, relâchée (−ATR) : un « ou » plus détendu, comme le « u » de l’anglais put.'
const NOTE_A_T = 'Voyelle centrale non arrondie, mi-ouverte, relâchée (−ATR).'
const NOTE_E_T = 'Voyelle centrale non arrondie, moyenne, tendue (+ATR).'
const NOTE_O_T = 'Voyelle centrale non arrondie, haute, relâchée (−ATR).'
const NOTE_I_T = 'Probablement la voyelle centrale non arrondie, haute et tendue (+ATR), que le godié note « ü ».'
const NOTE_NG = 'Proche du « ng » de parking. Les autres dialectes l’écrivent « ng ».'
const NOTE_BH = 'Consonne implosive bilabiale [ɓ] : un « b » prononcé en aspirant l’air vers l’intérieur. Elle se comporte comme une sonante.'
const NOTE_NY = 'Consonne nasale palatale : comme « gn » dans montagne.'
const NOTE_KP = 'Un « k » et un « p » prononcés en même temps.'
const NOTE_GB = 'Un « g » et un « b » prononcés en même temps.'
const NOTE_HIGH = 'Ton haut, écrit devant le mot. Le ton moyen n’est pas noté.'
const NOTE_LOW = 'Ton bas, écrit devant le mot (et non un simple trait d’union). Le ton moyen n’est pas noté.'
const NOTE_LOW_NBH = 'Ton bas, écrit devant le mot : ici avec un trait d’union insécable, pour qu’il reste collé au mot.'

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

/** A note that is not validated yet: its text, where it comes from, and the review flag. */
const draft = (note: string, noteSource: string): Pick<PhoneticSymbol, 'note' | 'noteSource' | 'noteNeedsReview'> =>
  ({ note, noteSource, noteNeedsReview: true })

export const ALPHABET: Record<DialectKey, PhoneticSymbol[]> = {
  western: [
    s('e-open', 'voyelles', 'ɛ', 50714, { upper: 'Ɛ', upperFrequency: 529, ...draft(NOTE_E, SRC_KRU) }),
    s('o-open', 'voyelles', 'ɔ', 36797, { upper: 'Ɔ', upperFrequency: 1403, ...draft(NOTE_O, SRC_KRU) }),
    s('i-lax', 'voyelles', 'ɩ', 68529, draft(NOTE_I, SRC_KRU)),
    s('u-lax', 'voyelles', 'ʋ', 31665, draft(NOTE_U, SRC_KRU)),
    s('a-t', 'trema', 'ä', 35385, draft(NOTE_A_T, SRC_GODIE)),
    s('e-t', 'trema', 'ë', 11131, draft(NOTE_E_T, SRC_GODIE)),
    s('o-t', 'trema', 'ö', 23993, draft(NOTE_O_T, SRC_GODIE)),
    s('i-t', 'trema', 'ï', 3501, draft(NOTE_I_T, SRC_GODIE)),
    s('bh', 'consonnes', 'bh', 17795, draft(NOTE_BH, SRC_GODIE)),
    s('ny', 'consonnes', 'ny', 11443, draft(NOTE_NY, SRC_GODIE)),
    s('kp', 'consonnes', 'kp', 6140, draft(NOTE_KP, SRC_IA)),
    s('gb', 'consonnes', 'gb', 4342, draft(NOTE_GB, SRC_IA)),
    s('gl', 'consonnes', 'gl', 5534),
    s('apos', 'marques', "'", 78623, draft(NOTE_HIGH, SRC_GODIE)),
    s('nbh', 'marques', '‑', 52175, draft(NOTE_LOW_NBH, SRC_GODIE)),
  ],
  eastern: [
    s('e-open', 'voyelles', 'ɛ', 33450, { upper: 'Ɛ', upperFrequency: 118, ...draft(NOTE_E, SRC_KRU) }),
    s('o-open', 'voyelles', 'ɔ', 32152, { upper: 'Ɔ', upperFrequency: 1246, ...draft(NOTE_O, SRC_KRU) }),
    s('i-lax', 'voyelles', 'ɩ', 52092, { upper: 'Ɩ', upperFrequency: 715, ...draft(NOTE_I, SRC_KRU) }),
    s('u-lax', 'voyelles', 'ʋ', 32596, { upper: 'Ʋ', upperFrequency: 70, ...draft(NOTE_U, SRC_KRU) }),
    s('e-t', 'trema', 'ë', 4375, draft(NOTE_E_T, SRC_GODIE)),
    s('o-t', 'trema', 'ö', 17876, draft(NOTE_O_T, SRC_GODIE)),
    s('i-t', 'trema', 'ï', 1945, draft(NOTE_I_T, SRC_GODIE)),
    s('bh', 'consonnes', 'bh', 21545, draft(NOTE_BH, SRC_GODIE)),
    s('ny', 'consonnes', 'ny', 8285, draft(NOTE_NY, SRC_GODIE)),
    s('kp', 'consonnes', 'kp', 5453, draft(NOTE_KP, SRC_IA)),
    s('gb', 'consonnes', 'gb', 5933, draft(NOTE_GB, SRC_IA)),
    s('gl', 'consonnes', 'gl', 5078),
    s('apos', 'marques', "'", 62855, draft(NOTE_HIGH, SRC_GODIE)),
    s('hy', 'marques', '-', 80307, draft(NOTE_LOW, SRC_GODIE)),
  ],
  northern: [
    s('e-open', 'voyelles', 'ɛ', 68059, { upper: 'Ɛ', upperFrequency: 1603, ...draft(NOTE_E, SRC_KRU) }),
    s('o-open', 'voyelles', 'ɔ', 58236, { upper: 'Ɔ', upperFrequency: 1096, ...draft(NOTE_O, SRC_KRU) }),
    s('eng', 'consonnes', 'ŋ', 2235, { upper: 'Ŋ', upperFrequency: 195, ...draft(NOTE_NG, SRC_GODIE) }),
    s('bh', 'consonnes', 'bh', 15569, draft(NOTE_BH, SRC_GODIE)),
    s('ny', 'consonnes', 'ny', 15685, draft(NOTE_NY, SRC_GODIE)),
    s('kp', 'consonnes', 'kp', 4981, draft(NOTE_KP, SRC_IA)),
    s('gb', 'consonnes', 'gb', 6304, draft(NOTE_GB, SRC_IA)),
    s('gl', 'consonnes', 'gl', 2190),
    s('apos', 'marques', "'", 73404, draft(NOTE_HIGH, SRC_GODIE)),
    s('hy', 'marques', '-', 70921, draft(NOTE_LOW, SRC_GODIE)),
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
