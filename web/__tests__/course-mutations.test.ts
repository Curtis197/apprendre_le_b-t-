import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCourse, saveLessonProgress, setLessonCompleted } from '../lib/courses/mutations'

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

describe('saveLessonProgress and setLessonCompleted', () => {
  type ExistingProgress = { progress_percent: number; score: number | null; completed_at: string | null }

  function fakeProgressClient(
    user: { id: string } | null = { id: 'user-1' },
    existing: ExistingProgress | null = null,
  ) {
    const upserted: Record<string, unknown>[] = []
    const deleted: Record<string, unknown>[] = []
    const client = {
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table: string) => {
        if (table !== 'lesson_progress') throw new Error(`Unexpected table ${table}`)
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
            }),
          }),
          upsert: async (row: Record<string, unknown>) => {
            upserted.push(row)
            return { error: null }
          },
          delete: () => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => {
                deleted.push({ [col1]: val1, [col2]: val2 })
                return { error: null }
              },
            }),
          }),
        }
      },
    } as unknown as SupabaseClient
    return { client, upserted, deleted }
  }

  it('saves partial progress and score', async () => {
    const { client, upserted } = fakeProgressClient()
    const res = await saveLessonProgress(client, 'l1', { progressPercent: 45, score: 80 })
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ progress_percent: 45, score: 80, completed: false })
    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      user_id: 'user-1',
      lesson_id: 'l1',
      progress_percent: 45,
      score: 80,
      completed_at: null,
    })
  })

  it('marks lesson completed when progressPercent reaches 100', async () => {
    const { client, upserted } = fakeProgressClient()
    const res = await saveLessonProgress(client, 'l1', { progressPercent: 100 })
    expect(res.error).toBeNull()
    expect(res.data?.completed).toBe(true)
    expect(upserted[0].completed_at).not.toBeNull()
  })

  it('setLessonCompleted(true) saves 100% progress', async () => {
    const { client, upserted } = fakeProgressClient()
    const res = await setLessonCompleted(client, 'l1', true)
    expect(res.error).toBeNull()
    expect(upserted[0]).toMatchObject({
      user_id: 'user-1',
      lesson_id: 'l1',
      progress_percent: 100,
    })
  })

  it('setLessonCompleted(false) deletes the progress record', async () => {
    const { client, deleted } = fakeProgressClient()
    const res = await setLessonCompleted(client, 'l1', false)
    expect(res.error).toBeNull()
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toEqual({ user_id: 'user-1', lesson_id: 'l1' })
  })

  it('does not undo completion or lower the best score on a worse retry', async () => {
    const completedAt = '2026-09-30T10:00:00.000Z'
    const { client, upserted } = fakeProgressClient(
      { id: 'user-1' },
      { progress_percent: 100, score: 90, completed_at: completedAt },
    )
    const res = await saveLessonProgress(client, 'l1', { progressPercent: 60, score: 60 })
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ progress_percent: 100, score: 90, completed: true })
    expect(upserted[0]).toMatchObject({ progress_percent: 100, score: 90, completed_at: completedAt })
  })

  it('never lowers partial progress', async () => {
    const { client, upserted } = fakeProgressClient(
      { id: 'user-1' },
      { progress_percent: 70, score: null, completed_at: null },
    )
    await saveLessonProgress(client, 'l1', { progressPercent: 20 })
    expect(upserted[0]).toMatchObject({ progress_percent: 70, completed_at: null })
    expect(upserted[0]).not.toHaveProperty('score')
  })

  it('refuses progress updates when signed out', async () => {
    const { client } = fakeProgressClient(null)
    const res = await saveLessonProgress(client, 'l1', { progressPercent: 50 })
    expect(res.error).toContain('Connectez-vous')
  })
})
