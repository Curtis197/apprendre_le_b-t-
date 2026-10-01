import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createResourceComment,
  deleteCommunityText,
  deleteResourceComment,
  submitCommunityText,
  updateCommunityText,
  updateResourceComment,
} from '../lib/community-mutations'

interface Call {
  table: string
  op: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown> | null
  filters: [string, unknown][]
}

type Reply = { data: unknown; error: { message: string } | null }

/** Records every query and answers each with `reply`. Awaitable at any point of the chain. */
function fakeClient(reply: Reply, user: { id: string; email?: string } | null = { id: 'u1', email: 'awa@test.local' }) {
  const calls: Call[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: user && { user_metadata: {}, ...user } } }) },
    from: (table: string) => {
      const call: Call = { table, op: 'insert', payload: null, filters: [] }
      calls.push(call)
      const api: Record<string, unknown> = {
        insert: (p: Record<string, unknown>) => { call.op = 'insert'; call.payload = p; return api },
        update: (p: Record<string, unknown>) => { call.op = 'update'; call.payload = p; return api },
        delete: () => { call.op = 'delete'; return api },
        eq: (c: string, v: unknown) => { call.filters.push([c, v]); return api },
        select: () => api,
        single: async () => reply,
        maybeSingle: async () => reply,
        then: (resolve: (r: Reply) => unknown) => resolve(reply),
      }
      return api
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const ok = (data: unknown): Reply => ({ data, error: null })
const input = { title: 'Chant du matin', type: 'song' as const, content_bete: 'vers un' }

describe('submitCommunityText', () => {
  it('requires a title and a text', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    expect((await submitCommunityText(client, { ...input, title: '  ' })).error).toContain('obligatoires')
    expect((await submitCommunityText(client, { ...input, content_bete: '' })).error).toContain('obligatoires')
    expect(calls).toHaveLength(0)
  })

  it('publishes in the signed-in user’s name, trimmed', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    const res = await submitCommunityText(client, { ...input, title: '  Chant  ' })
    expect(res).toEqual({ data: { id: 'r1' }, error: null })
    expect(calls[0].payload).toMatchObject({ title: 'Chant', created_by: 'u1', author_name: 'awa' })
  })

  it('needs a signed-in user', async () => {
    const { client } = fakeClient(ok({ id: 'r1' }), null)
    expect((await submitCommunityText(client, input)).error).toContain('Connectez-vous')
  })
})

describe('updateCommunityText', () => {
  it('only touches the caller’s own row', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    const res = await updateCommunityText(client, 'r1', { ...input, region: 'Gagnoa' })
    expect(res.error).toBeNull()
    expect(calls[0].op).toBe('update')
    expect(calls[0].filters).toEqual([['id', 'r1'], ['created_by', 'u1']])
    expect(calls[0].payload).toMatchObject({ title: 'Chant du matin', region: 'Gagnoa' })
  })

  it('keeps the existing author when the field is left blank, and replaces it when filled', async () => {
    const blank = fakeClient(ok({ id: 'r1' }))
    await updateCommunityText(blank.client, 'r1', { ...input, author_name: '  ' })
    expect(blank.calls[0].payload).not.toHaveProperty('author_name')

    const filled = fakeClient(ok({ id: 'r1' }))
    await updateCommunityText(filled.client, 'r1', { ...input, author_name: 'Grand-mère Awa' })
    expect(filled.calls[0].payload).toMatchObject({ author_name: 'Grand-mère Awa' })
  })

  it('rejects an unlisted region without querying', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    expect((await updateCommunityText(client, 'r1', { ...input, region: 'Issia' })).error).toContain('Région invalide')
    expect(calls).toHaveLength(0)
  })

  it('reports a resource that is missing or belongs to someone else', async () => {
    const { client } = fakeClient(ok(null))
    expect((await updateCommunityText(client, 'r1', input)).error).toContain('introuvable')
  })

  it('passes a database error through', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    expect((await updateCommunityText(client, 'r1', input)).error).toBe('boom')
  })
})

describe('deleteCommunityText', () => {
  it('succeeds only when a row was actually deleted', async () => {
    const deleted = fakeClient(ok([{ id: 'r1' }]))
    expect(await deleteCommunityText(deleted.client, 'r1')).toEqual({ data: null, error: null })
    expect(deleted.calls[0]).toMatchObject({ op: 'delete', filters: [['id', 'r1']] })

    const none = fakeClient(ok([]))
    expect((await deleteCommunityText(none.client, 'r1')).error).toContain('impossible')
  })

  it('needs a signed-in user', async () => {
    const { client } = fakeClient(ok([{ id: 'r1' }]), null)
    expect((await deleteCommunityText(client, 'r1')).error).toContain('Connectez-vous')
  })
})

describe('resource comments', () => {
  it('rejects an empty or over-long comment before querying', async () => {
    const { client, calls } = fakeClient(ok({ id: 'c1' }))
    expect((await createResourceComment(client, 'r1', '   ')).error).toContain('vide')
    expect((await createResourceComment(client, 'r1', 'x'.repeat(2001))).error).toContain('2000')
    expect((await updateResourceComment(client, 'c1', '')).error).toContain('vide')
    expect(calls).toHaveLength(0)
  })

  it('posts the trimmed text for the signed-in user, without sending a display name', async () => {
    const { client, calls } = fakeClient(ok({ id: 'c1' }))
    const res = await createResourceComment(client, 'r1', '  À corriger  ')
    expect(res).toEqual({ data: { id: 'c1' }, error: null })
    expect(calls[0].table).toBe('resource_comments')
    expect(calls[0].payload).toEqual({ resource_id: 'r1', user_id: 'u1', body: 'À corriger' })
  })

  it('edits only the caller’s own comment', async () => {
    const { client, calls } = fakeClient(ok([{ id: 'c1' }]))
    expect((await updateResourceComment(client, 'c1', 'Nouveau texte')).error).toBeNull()
    expect(calls[0].filters).toEqual([['id', 'c1'], ['user_id', 'u1']])

    const none = fakeClient(ok([]))
    expect((await updateResourceComment(none.client, 'c1', 'x')).error).toContain('introuvable')
  })

  it('deletes only when a row was removed', async () => {
    expect((await deleteResourceComment(fakeClient(ok([{ id: 'c1' }])).client, 'c1')).error).toBeNull()
    expect((await deleteResourceComment(fakeClient(ok([])).client, 'c1')).error).toContain('impossible')
  })
})
