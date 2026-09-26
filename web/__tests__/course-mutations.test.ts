import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCourse } from '../lib/courses/mutations'

type Reply = {
  data: { id: string; slug: string } | null
  error: { code?: string; message: string } | null
}

function fakeClient(replies: Reply[], user: { id: string } | null = { id: 'user-1' }) {
  const inserted: Record<string, unknown>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({
            single: async () => replies.shift() ?? { data: null, error: { message: 'no reply' } },
          }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client, inserted }
}

// Deterministic "random" that differs on each call, so retried slugs differ.
const counting = () => {
  let n = 0
  return () => (n++ % 36) / 36
}

const input = {
  title: 'Salutations',
  summary: 'Les bases',
  dialect: 'western' as const,
  level: 'beginner' as const,
}

describe('createCourse', () => {
  it('inserts a course owned by the signed-in user and returns its id and slug', async () => {
    const { client, inserted } = fakeClient([{ data: { id: 'c1', slug: 'salutations-abcd' }, error: null }])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: { id: 'c1', slug: 'salutations-abcd' }, error: null })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ owner_id: 'user-1', title: 'Salutations', summary: 'Les bases' })
    expect(inserted[0].slug).toMatch(/^salutations-[a-z0-9]{4}$/)
    expect(inserted[0]).not.toHaveProperty('status')
    expect(inserted[0]).not.toHaveProperty('access')
  })

  it('retries with a new slug on a unique-violation', async () => {
    const { client, inserted } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: { id: 'c2', slug: 'salutations-efgh' }, error: null },
    ])
    const result = await createCourse(client, input, counting())
    expect(result.error).toBeNull()
    expect(inserted).toHaveLength(2)
    expect(inserted[0].slug).not.toBe(inserted[1].slug)
  })

  it('gives up after three collisions', async () => {
    const collision: Reply = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const { client, inserted } = fakeClient([collision, collision, collision])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'Impossible de générer une adresse unique, réessayez.' })
    expect(inserted).toHaveLength(3)
  })

  it('surfaces other database errors without retrying', async () => {
    const { client, inserted } = fakeClient([{ data: null, error: { code: '42501', message: 'permission denied' } }])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'permission denied' })
    expect(inserted).toHaveLength(1)
  })

  it('refuses to create a course when signed out', async () => {
    const { client, inserted } = fakeClient([], null)
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'Connectez-vous pour créer un cours.' })
    expect(inserted).toHaveLength(0)
  })

  it('rejects titles outside 3 to 120 characters before touching the database', async () => {
    const { client, inserted } = fakeClient([])
    const tooShort = await createCourse(client, { ...input, title: 'ab' }, counting())
    const tooLong = await createCourse(client, { ...input, title: 'x'.repeat(121) }, counting())
    expect(tooShort.error).toBe('Le titre doit contenir entre 3 et 120 caractères.')
    expect(tooLong.error).toBe('Le titre doit contenir entre 3 et 120 caractères.')
    expect(inserted).toHaveLength(0)
  })
})
