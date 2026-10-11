import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addSpelling, createEntry } from '@/lib/lexicon-links-data'
import { emptyEntryForm } from '@/lib/lexicon-links'
import { saveVerse } from '@/lib/word-blocks-data'

const COMBINING = 'gö'      // g + o + combining diaeresis
const PRECOMPOSED = 'gö'
const failing = () => vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })
const fake = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient

describe('createEntry stores NFC', () => {
  it('normalises the spelling, the transcription, the synonyms and the example', async () => {
    const rpc = failing()
    const form = { ...emptyEntryForm(COMBINING, 'enfant', 'western'), ipa: 'ä', synonyms: 'ö, plain' }
    await createEntry(fake(rpc), {
      form,
      kind: 'word',
      example: { bete: 'ë mö', french: 'un enfant', literal: '' },
    })
    const args = rpc.mock.calls[0][1]
    expect(args.p_spelling).toBe(PRECOMPOSED)
    expect(args.p_ipa).toBe('ä')
    expect(args.p_synonyms).toEqual(['ö', 'plain'])
    expect(args.p_example.bete).toBe('ë mö')
  })
})

describe('addSpelling stores NFC', () => {
  it('normalises the spelling', async () => {
    const rpc = failing()
    await addSpelling(fake(rpc), 'L1', ` ${COMBINING} `)
    expect(rpc.mock.calls[0][1]).toEqual({ p_lexicon_id: 'L1', p_spelling: PRECOMPOSED })
  })
})

describe('saveVerse stores NFC and keeps the lines', () => {
  it('normalises the Bhété line and the literal line without touching line structure', async () => {
    const rpc = failing()
    await saveVerse(fake(rpc), {
      resourceId: 'R1', verseNo: 1, baseBete: 'x', baseLiteral: '',
      beteLine: 'ä b', literalLine: 'c̈', blocks: [],
    })
    const args = rpc.mock.calls[0][1]
    expect(args.p_bete_line).toBe('ä b')
    expect(args.p_literal_line).toBe('c̈'.normalize('NFC'))
  })
})
