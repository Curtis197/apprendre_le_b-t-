// lib/verses.ts — pair a long text with its translations verse by verse.
//
// Contributors write the Bhété text, the optional mot-à-mot and the French translation
// in three separate fields. For a song or a story, reading all of one before any of the
// next makes the translation hard to follow, so we align them: line N of the Bhété text
// goes with line N of each translation. Blank lines separate stanzas.
//
// Alignment degrades gracefully when the fields don't line up (see VerseAlignment).

export interface Verse {
  original: string
  literal?: string
  french?: string
}

export interface LineCounts {
  original: number
  literal: number | null
  french: number | null
}

export type VerseAlignment =
  /** One line or one sentence: nothing to align, show the plain three-tier card. */
  | { kind: 'single' }
  /** Every field has the same stanzas and the same lines in each: show verse by verse. */
  | { kind: 'verses'; unit: 'line' | 'sentence'; stanzas: Verse[][] }
  /** Same number of stanzas but lines differ inside them: keep each stanza's texts together. */
  | { kind: 'stanzas'; stanzas: Verse[]; counts: LineCounts }
  /** Fields don't line up: fall back to the plain card. `counts` helps the contributor fix it. */
  | { kind: 'misaligned'; counts: LineCounts }

/** Stanzas separated by blank lines; each stanza is its trimmed, non-empty lines. */
export function splitStanzas(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(block =>
      block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean),
    )
    .filter(stanza => stanza.length > 0)
}

/** Sentences ending in . ! ? or … (no look-behind: it is unsupported before Safari 16.4). */
export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? []
  return parts.map(p => p.trim()).filter(Boolean)
}

const countLines = (stanzas: string[][]) => stanzas.reduce((n, s) => n + s.length, 0)

function sameShape(a: string[][], b: string[][]): boolean {
  return a.length === b.length && a.every((stanza, i) => stanza.length === b[i].length)
}

function sameStanzaCount(a: string[][], b: string[][]): boolean {
  return a.length === b.length
}

export function alignVerses(
  original: string,
  literal?: string | null,
  french?: string | null,
): VerseAlignment {
  const o = splitStanzas(original)
  const l = literal?.trim() ? splitStanzas(literal) : null
  const f = french?.trim() ? splitStanzas(french) : null
  const others = [l, f].filter((x): x is string[][] => x !== null)
  const counts: LineCounts = {
    original: countLines(o),
    literal: l ? countLines(l) : null,
    french: f ? countLines(f) : null,
  }

  // ── A single line: maybe a paragraph of several sentences ────────────────
  if (counts.original <= 1) {
    const oSentences = splitSentences(o.flat().join(' '))
    if (oSentences.length < 2) return { kind: 'single' }

    const lSentences = l ? splitSentences(l.flat().join(' ')) : null
    const fSentences = f ? splitSentences(f.flat().join(' ')) : null
    const aligned = [lSentences, fSentences].every(s => s === null || s.length === oSentences.length)
    if (!aligned) return { kind: 'misaligned', counts }

    return {
      kind: 'verses',
      unit: 'sentence',
      stanzas: [
        oSentences.map((sentence, i) => ({
          original: sentence,
          literal: lSentences?.[i],
          french: fSentences?.[i],
        })),
      ],
    }
  }

  // ── Several lines: align line by line, else stanza by stanza ─────────────
  if (others.every(x => sameShape(o, x))) {
    return {
      kind: 'verses',
      unit: 'line',
      stanzas: o.map((stanza, i) =>
        stanza.map((line, j) => ({ original: line, literal: l?.[i][j], french: f?.[i][j] })),
      ),
    }
  }

  if (others.every(x => sameStanzaCount(o, x))) {
    return {
      kind: 'stanzas',
      stanzas: o.map((stanza, i) => ({
        original: stanza.join('\n'),
        literal: l?.[i].join('\n'),
        french: f?.[i].join('\n'),
      })),
      counts,
    }
  }

  return { kind: 'misaligned', counts }
}

/** Total verses in a 'verses' alignment, for "✓ 8 vers alignés". */
export function countVerses(alignment: Extract<VerseAlignment, { kind: 'verses' }>): number {
  return alignment.stanzas.reduce((n, s) => n + s.length, 0)
}

/** What to tell a contributor about how their text will be displayed (null: nothing to say). */
export function describeAlignment(alignment: VerseAlignment): { ok: boolean; message: string } | null {
  switch (alignment.kind) {
    case 'single':
      return null
    case 'verses': {
      const n = countVerses(alignment)
      return { ok: true, message: `✓ ${n} ${alignment.unit === 'sentence' ? 'phrases alignées' : 'vers alignés'}` }
    }
    case 'stanzas': {
      const found = formatCounts(alignment.counts)
      const n = alignment.stanzas.length
      return {
        ok: false,
        message:
          n === 1
            ? `Nombre de lignes différent (${found}) : le texte et sa traduction s’afficheront en un seul bloc. ` +
              'Pour un affichage vers par vers, gardez le même nombre de lignes dans chaque champ.'
            : `Les ${n} couplets correspondent, mais pas leurs lignes (${found}) : ` +
              'la traduction s’affichera couplet par couplet, pas vers par vers.',
      }
    }
    case 'misaligned':
      return {
        ok: false,
        message:
          `Nombre de lignes différent (${formatCounts(alignment.counts)}). Pour un affichage vers par vers, ` +
          'gardez le même nombre de lignes dans chaque champ ; une ligne vide sépare les couplets.',
      }
  }
}

function formatCounts({ original, literal, french }: LineCounts): string {
  return [
    `bhété : ${original}`,
    literal !== null && `mot à mot : ${literal}`,
    french !== null && `français : ${french}`,
  ]
    .filter(Boolean)
    .join(', ')
}
