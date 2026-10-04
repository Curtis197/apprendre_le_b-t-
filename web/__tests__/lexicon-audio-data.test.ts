import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { audioErrorMessage, deletePronunciation, listPronunciations, reportPronunciation, uploadPronunciation } from '@/lib/lexicon-audio-data'

const mk = (over: { upload?: unknown; remove?: unknown; rpc?: unknown; insert?: unknown; auth?: unknown } = {}) => {
  const upload = vi.fn().mockResolvedValue(over.upload ?? { error: null })
  const remove = vi.fn().mockResolvedValue(over.remove ?? { error: null })
  const rpc = vi.fn().mockResolvedValue(over.rpc ?? { data: 'rec-1', error: null })
  const insert = vi.fn().mockResolvedValue(over.insert ?? { error: null })
  const client = {
    storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
    rpc,
    from: vi.fn().mockReturnValue({ insert }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: over.auth === null ? null : { id: 'u1' } } }) },
  } as unknown as SupabaseClient
  return { client, upload, remove, rpc, insert }
}
const blob = (size = 100, type = 'audio/webm;codecs=opus') => new Blob([new Uint8Array(size)], { type })

describe('uploadPronunciation', () => {
  it('uploads into the author’s folder with the bare mime type, then records it', async () => {
    const { client, upload, rpc } = mk()
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res).toEqual({ data: { id: 'rec-1' }, error: null })
    const [path, , opts] = upload.mock.calls[0]
    expect(path).toMatch(/^u1\/e1\/\d+\.webm$/)
    expect(opts).toEqual({ contentType: 'audio/webm', upsert: false })
    expect(rpc).toHaveBeenCalledWith('add_lexicon_pronunciation', { p_lexicon_id: 'e1', p_path: path })
  })
  it('refuses an empty or oversized blob before any upload', async () => {
    const { client, upload } = mk()
    expect((await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob(0) })).error).toMatch(/vide/)
    expect((await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob(1048577) })).error).toMatch(/1 Mo/)
    expect(upload).not.toHaveBeenCalled()
  })
  it('removes the file and explains when the database refuses', async () => {
    const { client, remove, upload } = mk({ rpc: { data: null, error: { message: 'too_many' } } })
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res.error).toMatch(/3 enregistrements/)
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]])
  })
  it('reports an upload failure without calling the database', async () => {
    const { client, rpc } = mk({ upload: { error: { message: 'boom' } } })
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res.error).toMatch(/réessayer/i)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('deletePronunciation', () => {
  it('deletes the row, then the file it returned', async () => {
    const { client, remove, rpc } = mk({ rpc: { data: 'u1/e1/1.webm', error: null } })
    expect(await deletePronunciation(client, 'rec-1')).toEqual({ data: true, error: null })
    expect(rpc).toHaveBeenCalledWith('delete_lexicon_pronunciation', { p_id: 'rec-1' })
    expect(remove).toHaveBeenCalledWith(['u1/e1/1.webm'])
  })
  it('keeps going when the file removal fails (the row is already gone)', async () => {
    const { client } = mk({ rpc: { data: 'p', error: null }, remove: { error: { message: 'x' } } })
    expect((await deletePronunciation(client, 'r')).error).toBeNull()
  })
  it('maps the refusals', async () => {
    expect((await deletePronunciation(mk({ rpc: { data: null, error: { message: 'not_allowed' } } }).client, 'r')).error).toMatch(/auteur/)
    expect((await deletePronunciation(mk({ rpc: { data: null, error: { message: 'not_found' } } }).client, 'r')).error).toMatch(/n’existe plus/)
  })
})

describe('listPronunciations', () => {
  it('maps the rows and returns nothing on error', async () => {
    const rows = [{ id: 'a', path: 'p', author: 'Awa', created_by: 'u1', created_at: 't' }]
    const { client, rpc } = mk({ rpc: { data: rows, error: null } })
    expect(await listPronunciations(client, 'e1')).toEqual([{ id: 'a', path: 'p', author: 'Awa', createdBy: 'u1', createdAt: 't' }])
    expect(rpc).toHaveBeenCalledWith('get_lexicon_pronunciations', { p_lexicon_id: 'e1' })
    expect(await listPronunciations(mk({ rpc: { data: null, error: { message: 'x' } } }).client, 'e1')).toEqual([])
  })
})

describe('reportPronunciation', () => {
  it('creates a message-only correction', async () => {
    const { client, insert } = mk()
    expect(await reportPronunciation(client, 'rec-1', ' Trop de bruit. ')).toEqual({ data: true, error: null })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      target_type: 'pronunciation', target_id: 'rec-1', field: 'audio', kind: 'other', message: 'Trop de bruit.', suggestion: null, reporter_id: 'u1',
    }))
  })
  it('needs a message and a session', async () => {
    expect((await reportPronunciation(mk().client, 'r', '  ')).error).toMatch(/Expliquez/)
    expect((await reportPronunciation(mk({ auth: null }).client, 'r', 'x')).error).toMatch(/Connectez-vous/)
  })
})

describe('audioErrorMessage', () => {
  it('falls back to a generic message', () => {
    expect(audioErrorMessage('boom')).toMatch(/réessayer/i)
  })
})
