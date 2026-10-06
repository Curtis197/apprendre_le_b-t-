import { describe, expect, it } from 'vitest'
import { createOutcome, EXISTING_ENTRY_NOTICE } from '../lib/lexicon-links'
import type { LexSummary } from '../lib/word-blocks'

const entry = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: null, spellings: [], ...over,
})
const ok = (existed: boolean, e: LexSummary, senseIds: string[]) => ({ data: { existed, senseIds, entry: e }, error: null })

describe('createOutcome', () => {
  it('EXISTING_ENTRY_NOTICE is the exact French text with curly apostrophes', () => {
    const expected = 'Cette entrée existe déjà, vos informations n’ont pas été ajoutées. Ouvrez sa fiche pour ajouter un sens ou une graphie.'
    expect(EXISTING_ENTRY_NOTICE).toBe(expected)
    expect(EXISTING_ENTRY_NOTICE).toContain('’')
    expect(EXISTING_ENTRY_NOTICE).not.toContain("'")
  })
  it('reports a new word with its first sense', () => {
    expect(createOutcome(ok(false, entry(), ['S1', 'S2']), 'word')).toEqual({ type: 'created', entry: entry(), senseId: 'S1' })
  })
  it('gives a marker no sense', () => {
    const m = entry({ kind: 'marker', senses: [] })
    expect(createOutcome(ok(false, m, []), 'marker')).toEqual({ type: 'created', entry: m, senseId: null })
  })
  it('reports an existing entry of the same kind with the notice, never as created', () => {
    const out = createOutcome(ok(true, entry(), ['S1']), 'word')
    expect(out).toEqual({ type: 'existing', entry: entry(), senseId: 'S1', notice: EXISTING_ENTRY_NOTICE })
  })
  it('refuses an existing entry of the other kind', () => {
    const out = createOutcome(ok(true, entry({ kind: 'marker', spelling: 'yi' }), []), 'word')
    expect(out).toEqual({ type: 'error', message: 'Cette graphie existe déjà comme marqueur grammatical : yi.' })
    const out2 = createOutcome(ok(true, entry(), ['S1']), 'marker')
    expect(out2).toEqual({ type: 'error', message: 'Cette graphie existe déjà comme mot : ghèhi-wu.' })
  })
  it('passes an RPC error message through', () => {
    expect(createOutcome({ data: null, error: 'Dialecte invalide.' }, 'word')).toEqual({ type: 'error', message: 'Dialecte invalide.' })
  })
  it('falls back to a generic message when there is neither data nor error', () => {
    expect(createOutcome({ data: null, error: null }, 'word')).toEqual({ type: 'error', message: 'Une erreur est survenue. Veuillez réessayer.' })
  })
})
