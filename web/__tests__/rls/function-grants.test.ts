import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createUser, makeAdmin, type TestUser } from './helpers'

// Supabase exposes every function in `public` at /rest/v1/rpc/<name>. These tests pin down which of
// them a client may call (migration 20261003000003_revoke_client_execute_on_internal_functions.sql).
describe('function grants', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([createUser('fg-alice'), createUser('fg-bob'), createUser('fg-boss')])
    await makeAdmin(boss.id)
  })

  describe('internal functions are not callable by clients', () => {
    it('refuses the maintenance function to anonymous and signed-in callers', async () => {
      // It was callable by anyone before: a call from a client must now be refused.
      expect((await anonClient().rpc('prune_translation_usage')).error).not.toBeNull()
      expect((await alice.client.rpc('prune_translation_usage')).error).not.toBeNull()
    })

    it.each([
      'handle_new_user',
      'lessons_create_content',
      'lexicon_seed_translation',
      'lexicon_translations_sync_primary',
      'lesson_progress_guard_score',
      'submissions_guard_review_fields',
      'usage_sync_trigger',
    ])('does not let a client call the trigger function %s', async name => {
      expect((await anonClient().rpc(name)).error).not.toBeNull()
      const res = await alice.client.rpc(name)
      expect(res.error).not.toBeNull()
      // refused for lack of permission, not merely because a trigger function cannot be called directly
      expect(res.error?.message ?? '').not.toMatch(/trigger functions can only be called/i)
    })
  })

  describe('functions for signed-in users only', () => {
    it('refuses anonymous callers with a permission error', async () => {
      const quiz = await anonClient().rpc('submit_quiz', {
        p_lesson_id: '00000000-0000-0000-0000-000000000000',
        p_answers: {},
      })
      expect(quiz.error?.code).toBe('42501')
    })
  })

  describe('functions the row-level-security policies depend on stay callable', () => {
    it('lets anonymous and signed-in callers use is_admin()', async () => {
      const anon = await anonClient().rpc('is_admin')
      expect(anon.error).toBeNull()
      expect(anon.data).toBe(false)
      expect((await boss.client.rpc('is_admin')).data).toBe(true)
    })
  })

  describe('get_user_video_quota', () => {
    it('gives a signed-in user their own quota', async () => {
      const { data, error } = await alice.client.rpc('get_user_video_quota', { p_user_id: alice.id })
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data[0].max_minutes).toBe(30)
    })

    it('gives nothing for another user’s quota', async () => {
      const { data, error } = await alice.client.rpc('get_user_video_quota', { p_user_id: bob.id })
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('lets an admin read any user’s quota', async () => {
      const { data } = await boss.client.rpc('get_user_video_quota', { p_user_id: bob.id })
      expect(data).toHaveLength(1)
    })

    it('refuses anonymous callers', async () => {
      const { error } = await anonClient().rpc('get_user_video_quota', { p_user_id: alice.id })
      expect(error).not.toBeNull()
    })
  })
})
