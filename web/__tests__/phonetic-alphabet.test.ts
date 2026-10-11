import { describe, it, expect } from 'vitest'
import { DIALECT_KEYS } from '@/lib/dialect'
import { ALPHABET, groupedSymbols, trayRows } from '@/lib/phonetic-alphabet'

const hex = (s: string) => 'U+' + s.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')

describe('ALPHABET inventories', () => {
  it('has a non-empty list for every dialect, with unique ids', () => {
    for (const d of DIALECT_KEYS) {
      expect(ALPHABET[d].length).toBeGreaterThan(0)
      const ids = ALPHABET[d].map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every glyph is NFC, and letter groups are the only entries without a code point', () => {
    for (const d of DIALECT_KEYS) {
      for (const s of ALPHABET[d]) {
        expect(s.glyph).toBe(s.glyph.normalize('NFC'))
        if (s.upper) expect(s.upper).toBe(s.upper.normalize('NFC'))
        if (s.codePoint) expect(hex(s.glyph)).toBe(s.codePoint)
        else expect(s.typable).toBe(true)
        expect(s.frequency).toBeGreaterThan(0)
        expect(s.examples).toEqual([])
      }
    }
  })

  it('uses exactly the intended characters (not look-alikes)', () => {
    // Written as escapes so a look-alike pasted into the data file cannot pass unnoticed.
    const expected: Record<string, string> = {
      'ɛ': 'U+025B', 'ɔ': 'U+0254', 'ɩ': 'U+0269', 'ʋ': 'U+028B', 'ŋ': 'U+014B',
      'ä': 'U+00E4', 'ë': 'U+00EB', 'ö': 'U+00F6', 'ï': 'U+00EF',
      "'": 'U+0027', '‑': 'U+2011', '-': 'U+002D', '"': 'U+0022',
    }
    const capitals: Record<string, string> = {
      'Ɛ': 'U+0190', 'Ɔ': 'U+0186', 'Ɩ': 'U+0196', 'Ʋ': 'U+01B2', 'Ŋ': 'U+014A',
    }
    const seen = new Set<string>()
    for (const d of DIALECT_KEYS) {
      for (const s of ALPHABET[d]) {
        if (s.typable) continue
        expect(expected[s.glyph], `unexpected glyph ${s.glyph}`).toBe(s.codePoint)
        seen.add(s.glyph)
        if (s.upper) expect(capitals[s.upper], `unexpected capital ${s.upper}`).toBe(hex(s.upper))
      }
    }
    expect(seen.size).toBe(Object.keys(expected).length)
  })

  it('only offers a symbol in a dialect that uses it', () => {
    const has = (d: (typeof DIALECT_KEYS)[number], g: string) => ALPHABET[d].some(s => s.glyph === g)
    expect(has('northern', 'ɩ')).toBe(false)
    expect(has('northern', 'ʋ')).toBe(false)
    expect(has('northern', 'ŋ')).toBe(true)
    expect(has('western', 'ŋ')).toBe(false)
    expect(has('eastern', 'ŋ')).toBe(false)
    expect(has('western', 'ä')).toBe(true)
    expect(has('eastern', 'ä')).toBe(false)
    expect(has('northern', 'ö')).toBe(false)
  })

  it('uses the dialect\'s own hyphen and the northern quote mark', () => {
    const glyphs = (d: (typeof DIALECT_KEYS)[number]) => ALPHABET[d].map(s => s.glyph)
    expect(glyphs('western')).toContain('‑')
    expect(glyphs('western')).not.toContain('-')
    expect(glyphs('eastern')).toContain('-')
    expect(glyphs('northern')).toContain('-')
    expect(glyphs('northern')).toContain('"')
    expect(glyphs('western')).not.toContain('"')
  })
})

describe('groupedSymbols', () => {
  it('omits empty groups and keeps the declared order', () => {
    const north = groupedSymbols('northern').map(g => g.id)
    expect(north).toEqual(['voyelles', 'consonnes', 'marques'])
    const west = groupedSymbols('western').map(g => g.id)
    expect(west).toEqual(['voyelles', 'trema', 'consonnes', 'marques'])
  })
})

describe('trayRows', () => {
  it('lists insertable glyphs only (no letter groups like bh), capitals included when attested', () => {
    const rows = trayRows('eastern')
    const all = rows.flatMap(r => r.glyphs)
    expect(all).toContain('ɛ')
    expect(all).toContain('Ɛ')
    expect(all).toContain('Ɩ')
    expect(all).not.toContain('bh')
    expect(rows[0].title).toBe('Voyelles')
  })

  it('does not offer a capital that does not occur in the dialect', () => {
    expect(trayRows('western').flatMap(r => r.glyphs)).not.toContain('Ɩ')
  })

  it('has no row without glyphs', () => {
    for (const d of DIALECT_KEYS) for (const r of trayRows(d)) expect(r.glyphs.length).toBeGreaterThan(0)
  })
})
