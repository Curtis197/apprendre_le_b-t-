import { describe, expect, it, vi } from 'vitest'
import { submitNewWord } from '../lib/contribution'
import { EXISTING_ENTRY_NOTICE } from '../lib/lexicon-links'
import type { LexSummary } from '../lib/word-blocks'

const entry = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: null, spellings: [], ...over,
})
const ok = (existed: boolean, e: LexSummary, senseIds: string[]) => ({ data: { existed, senseIds, entry: e }, error: null })

describe('submitNewWord', () => {
  it('reports a create error and never uploads', async () => {
    const upload = vi.fn()
    const out = await submitNewWord({ create: async () => ({ data: null, error: 'Dialecte invalide.' }), upload })
    expect(out).toEqual({ type: 'error', message: 'Dialecte invalide.' })
    expect(upload).not.toHaveBeenCalled()
  })
  it('reports an existing entry with the notice and never uploads', async () => {
    const upload = vi.fn()
    const out = await submitNewWord({ create: async () => ok(true, entry(), ['S1']), upload })
    expect(out).toEqual({ type: 'existing', id: 'L1', notice: EXISTING_ENTRY_NOTICE })
    expect(upload).not.toHaveBeenCalled()
  })
  it('reports a created word without recording', async () => {
    const out = await submitNewWord({ create: async () => ok(false, entry(), ['S1']), upload: null })
    expect(out).toEqual({ type: 'created', id: 'L1', audioFailedReason: undefined })
  })
  it('uploads the recording for the new entry id', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    const out = await submitNewWord({ create: async () => ok(false, entry(), ['S1']), upload })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith('L1')
    expect(out).toEqual({ type: 'created', id: 'L1', audioFailedReason: undefined })
  })
  it('reports the upload failure reason', async () => {
    const upload = async () => ({ error: 'Fichier trop gros.' })
    const out = await submitNewWord({ create: async () => ok(false, entry(), ['S1']), upload })
    expect(out).toEqual({ type: 'created', id: 'L1', audioFailedReason: 'Fichier trop gros.' })
  })
})
