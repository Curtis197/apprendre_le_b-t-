import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addSense, addSpelling, createEntry, findCandidates, getEntry, lexErrorMessage, setMarkerMeaning } from '@/lib/lexicon-links-data'
import { emptyEntryForm } from '@/lib/lexicon-links'

const rawEntry = {
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: ['noun'], description: 'Le ciel.',
  synonyms: ['firmament'], marker: { type: null, meaning: null, french: null },
  senses: [{ id: 'S1', french: 'ciel', context: null }], sense_id: 'S1', spellings: ['ghéhi-wu'],
}
const fake = (rpc: ReturnType<typeof vi.fn>, from?: unknown) => ({ rpc, from }) as unknown as SupabaseClient

describe('findCandidates', () => {
  it('maps rows and passes the parameters', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ match_kind: 'near', matched: 'ghéhi-wu', distance: 1, entry: rawEntry }], error: null })
    const out = await findCandidates(fake(rpc), { text: ' ghehi-wu ', dialect: 'western' })
    expect(rpc).toHaveBeenCalledWith('find_lexicon_candidates', { p_text: 'ghehi-wu', p_dialect: 'western', p_kind: null, p_limit: 7 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ matchKind: 'near', matched: 'ghéhi-wu', distance: 1 })
    expect(out[0].entry).toMatchObject({ id: 'L1', kind: 'word', senseId: 'S1', spellings: ['ghéhi-wu'], pos: ['noun'] })
  })
  it('returns nothing on error, on blank text and on garbage rows', async () => {
    expect(await findCandidates(fake(vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })), { text: 'a' })).toEqual([])
    const rpc = vi.fn()
    expect(await findCandidates(fake(rpc), { text: '   ' })).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(await findCandidates(fake(vi.fn().mockResolvedValue({ data: [{ entry: null }, 5], error: null })), { text: 'a' })).toEqual([])
  })
})

describe('createEntry', () => {
  it('sends the form as the function arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'L1', existed: false, sense_ids: ['S1'], entry: rawEntry }, error: null })
    const form = { ...emptyEntryForm('ghèhi-wu', 'au ciel', 'western'), ipa: 'ɡɛ̀hi', category: 'noun', synonyms: 'firmament, voûte', description: ' Le ciel. ',
      senses: [{ french: 'ciel', context: 'en haut' }, { french: '  ', context: '' }] }
    const res = await createEntry(fake(rpc), { form, kind: 'word', example: { bete: 'a', french: 'b', literal: 'c' } })
    expect(rpc).toHaveBeenCalledWith('create_lexicon_entry', {
      p_spelling: 'ghèhi-wu', p_ipa: 'ɡɛ̀hi', p_dialect: 'western', p_kind: 'word', p_pos: ['noun'], p_description: 'Le ciel.',
      p_notes: null, p_synonyms: ['firmament', 'voûte'], p_lemma: null,
      p_senses: [{ french: 'ciel', context: 'en haut' }], p_example: { bete: 'a', french: 'b', literal: 'c' },
    })
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ id: 'L1', existed: false, senseIds: ['S1'] })
    expect(res.data!.entry.senseId).toBe('S1')
  })
  it('sends nulls for empty optional fields and no senses for a marker', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'M1', existed: true, sense_ids: [], entry: { ...rawEntry, kind: 'marker' } }, error: null })
    await createEntry(fake(rpc), { form: emptyEntryForm('ye', '', 'western'), kind: 'marker' })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kind: 'marker', p_senses: [], p_pos: null, p_synonyms: null, p_example: null, p_ipa: null })
  })
  it('maps the error codes to French', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'sense_required' } })
    const res = await createEntry(fake(rpc), { form: emptyEntryForm('x', 'y', 'western'), kind: 'word' })
    expect(res.error).toMatch(/sens/i)
  })
})

describe('other writes and reads', () => {
  it('addSpelling and setMarkerMeaning call their functions and map errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'id', error: null })
    expect((await addSpelling(fake(rpc), 'L1', ' ghéhi ')).error).toBeNull()
    expect(rpc).toHaveBeenCalledWith('add_lexicon_spelling', { p_lexicon_id: 'L1', p_spelling: 'ghéhi' })
    expect((await setMarkerMeaning(fake(rpc), 'M1', { type: 'temps', meaning: 'futur', french: '' })).error).toBeNull()
    expect(rpc).toHaveBeenCalledWith('set_marker_meaning', { p_lexicon_id: 'M1', p_type: 'temps', p_meaning: 'futur', p_french: '' })
    const bad = vi.fn().mockResolvedValue({ data: null, error: { message: 'spelling_exists' } })
    expect((await addSpelling(fake(bad), 'L1', 'x')).error).toMatch(/déjà/i)
    const bad2 = vi.fn().mockResolvedValue({ data: null, error: { message: 'meaning_already_set' } })
    expect((await setMarkerMeaning(fake(bad2), 'M1', { type: '', meaning: 'a', french: '' })).error).toMatch(/correction/i)
  })
  it('addSense inserts a translation row', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const client = fake(vi.fn(), from)
    expect((await addSense(client, 'L1', 'U1', { french: ' haut ', context: ' ' })).error).toBeNull()
    expect(from).toHaveBeenCalledWith('lexicon_translations')
    expect(insert).toHaveBeenCalledWith({ lexicon_id: 'L1', french: 'haut', context: null, created_by: 'U1' })
    expect((await addSense(client, 'L1', 'U1', { french: ' ', context: '' })).error).toMatch(/obligatoire/i)
  })
  it('getEntry returns a summary or null', async () => {
    expect((await getEntry(fake(vi.fn().mockResolvedValue({ data: rawEntry, error: null })), 'L1'))?.id).toBe('L1')
    expect(await getEntry(fake(vi.fn().mockResolvedValue({ data: null, error: null })), 'L1')).toBeNull()
  })
  it('lexErrorMessage falls back to a generic message', () => {
    expect(lexErrorMessage('boom')).toMatch(/réessayer/i)
    expect(lexErrorMessage('not_signed_in')).toMatch(/connectez/i)
  })
})
