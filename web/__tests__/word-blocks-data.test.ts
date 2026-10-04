import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getResourceWords, parseVerse, saveErrorMessage, saveVerse } from '../lib/word-blocks-data'

const fake = (result: { data?: unknown; error?: { message: string } | null }) =>
  ({ rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }

describe('parseVerse', () => {
  it('reads a verse as returned by get_resource_words', () => {
    const v = parseVerse({
      verse_no: 2, stale: false, bete_line: 'en ye', literal_line: 'je va',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: 'sujet', composition: null, marker: null },
        { position: 2, bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, note: null, composition: '', marker: { type: 'temps', meaning: 'futur', french: null } },
      ],
    })
    expect(v.verse_no).toBe(2)
    expect(v.blocks[0].note).toBe('sujet')
    expect(v.blocks[1]).toMatchObject({ solo: true, is_marker: true, composition: null, marker: { type: 'temps', meaning: 'futur', french: null } })
  })

  it('survives missing or malformed fields', () => {
    const v = parseVerse({ verse_no: 1, blocks: [{ position: 1, bete_idx: 'x', is_marker: true }] })
    expect(v).toEqual({
      verse_no: 1, stale: false, bete_line: '', literal_line: '',
      blocks: [{ position: 1, bete_idx: [], gloss_idx: [], is_marker: true, solo: false, note: null, composition: null, marker: null, lex: null }],
    })
  })

  it('parses the linked entry of a block', () => {
    const v = parseVerse({
      verse_no: 1, stale: false, bete_line: 'a', literal_line: 'x',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null,
          lex: { id: 'L1', kind: 'word', spelling: 'a', dialect: 'western', senses: [{ id: 'S1', french: 'x', context: null }], sense_id: 'S1' } },
        { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: false, solo: false, lex: 'garbage' },
      ],
    })
    expect(v.blocks[0].lex).toMatchObject({ id: 'L1', kind: 'word', senseId: 'S1', pos: [], synonyms: [], spellings: [], ipa: null })
    expect(v.blocks[0].lex!.senses).toEqual([{ id: 'S1', french: 'x', context: null }])
    expect(v.blocks[1].lex).toBeNull()
  })

  it('parses the recordings of a linked entry and defaults to none', () => {
    const lex = (audio: unknown) =>
      parseVerse({
        verse_no: 1, stale: false, bete_line: 'a', literal_line: 'x',
        blocks: [{ position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, lex: { id: 'L1', kind: 'word', audio } }],
      }).blocks[0].lex!
    expect(lex([{ id: 'A1', path: 'u/e/1.webm', author: 'Awa', created_at: '2026-10-04T10:00:00Z' }]).audio).toEqual([
      { id: 'A1', path: 'u/e/1.webm', author: 'Awa', createdAt: '2026-10-04T10:00:00Z' },
    ])
    expect(lex(undefined).audio).toEqual([])
    expect(lex([{ id: 5 }, null, 'x']).audio).toEqual([])
  })
})

describe('getResourceWords', () => {
  it('returns the parsed verses', async () => {
    const client = fake({ data: [{ verse_no: 1, stale: true, bete_line: 'a', literal_line: 'x', blocks: [] }] })
    const verses = await getResourceWords(client, 'r1')
    expect(client.rpc).toHaveBeenCalledWith('get_resource_words', { p_resource: 'r1' })
    expect(verses).toEqual([{ verse_no: 1, stale: true, bete_line: 'a', literal_line: 'x', blocks: [] }])
  })

  it('returns nothing when the call fails or the data is not a list', async () => {
    expect(await getResourceWords(fake({ error: { message: 'boom' } }), 'r1')).toEqual([])
    expect(await getResourceWords(fake({ data: null }), 'r1')).toEqual([])
  })
})

describe('saveVerse', () => {
  const args = {
    resourceId: 'r1', verseNo: 3, baseBete: 'a b', baseLiteral: 'x y', beteLine: null, literalLine: 'x yy',
    blocks: [{ bete_idx: [0, 1], gloss_idx: [0, 1], is_marker: false, solo: false, note: null, composition: null }],
  }

  it('sends the lines the editor was built on and the blocks', async () => {
    const client = fake({ data: { saved: 1, verse_hash: 'h' } })
    const res = await saveVerse(client, args)
    expect(client.rpc).toHaveBeenCalledWith('save_resource_verse', {
      p_resource: 'r1', p_verse: 3, p_base_bete: 'a b', p_base_literal: 'x y',
      p_bete_line: null, p_literal_line: 'x yy', p_blocks: args.blocks,
    })
    expect(res).toEqual({ data: { saved: 1, verse_hash: 'h' }, error: null })
  })

  it('turns database error codes into French messages', async () => {
    const res = await saveVerse(fake({ error: { message: 'text_changed' } }), args)
    expect(res.data).toBeNull()
    expect(res.error).toMatch(/texte de ce vers a changé/)
  })
})

describe('saveErrorMessage', () => {
  it('finds the code inside a longer message', () => {
    expect(saveErrorMessage('ERROR: not_owner (SQLSTATE 42501)')).toMatch(/contributeur/)
    expect(saveErrorMessage('bete_word_uncovered')).toMatch(/aucun bloc/)
    expect(saveErrorMessage('bad_line')).toMatch(/saut de ligne/)
  })

  it('has French messages for the link errors', () => {
    for (const code of ['marker_needs_entry', 'marker_needs_marker_entry', 'word_needs_word_entry', 'sense_not_of_entry', 'sense_without_entry', 'entry_not_found', 'bad_link']) {
      expect(saveErrorMessage(`x ${code} y`)).not.toMatch(/réessayer/i)
    }
  })

  it('falls back to a generic message for anything else', () => {
    expect(saveErrorMessage('something odd')).toBe("Erreur lors de l'enregistrement. Veuillez réessayer.")
  })
})
