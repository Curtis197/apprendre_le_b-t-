import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, uid, type TestUser } from './helpers'
import { applyPreferenceChange } from '../../lib/mail/unsubscribe'

describe('email tables RLS', () => {
  let alice: TestUser
  let bob: TestUser
  let carol: TestUser

  beforeAll(async () => {
    ;[alice, bob, carol] = await Promise.all([createUser('em-alice'), createUser('em-bob'), createUser('em-carol')])
    must(await alice.client.from('email_preferences').insert({ user_id: alice.id }).select(), 'alice prefs')
    must(await bob.client.from('email_preferences').insert({ user_id: bob.id }).select(), 'bob prefs')
  })

  it('lets a user read only their own preferences', async () => {
    const { data } = await alice.client.from('email_preferences').select('user_id')
    expect(data?.map((r) => r.user_id)).toEqual([alice.id])
  })

  it('refuses a preference row created for someone else', async () => {
    const { error } = await alice.client.from('email_preferences').insert({ user_id: carol.id })
    expect(error).not.toBeNull()
    const { data } = await admin.from('email_preferences').select('user_id').eq('user_id', carol.id)
    expect(data).toEqual([])
  })

  it('lets a user toggle categories but not rewrite the unsubscribe token', async () => {
    const before = must(await admin.from('email_preferences').select('unsubscribe_token').eq('user_id', alice.id).single(), 'token')
    const toggle = await alice.client.from('email_preferences').update({ weekly_progress: false }).eq('user_id', alice.id)
    expect(toggle.error).toBeNull()
    const forged = await alice.client
      .from('email_preferences')
      .update({ unsubscribe_token: '00000000-0000-4000-8000-000000000000' })
      .eq('user_id', alice.id)
    expect(forged.error).not.toBeNull()
    const after = must(await admin.from('email_preferences').select('unsubscribe_token, weekly_progress').eq('user_id', alice.id).single(), 'token after')
    expect(after.unsubscribe_token).toBe(before.unsubscribe_token)
    expect(after.weekly_progress).toBe(false)
    await admin.from('email_preferences').update({ weekly_progress: true }).eq('user_id', alice.id)
  })

  it('hides the outbox from signed-in users', async () => {
    must(
      await admin.from('email_outbox').insert({ user_id: alice.id, category: 'course_activity', template: 'weekly_progress', dedupe_key: `t-hide-${uid()}` }).select(),
      'seed outbox',
    )
    const { data } = await alice.client.from('email_outbox').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('leases claimed rows so overlapping runs cannot claim them twice, and refuses non-service callers', async () => {
    const row = must(
      await admin.from('email_outbox').insert({ user_id: alice.id, category: 'course_activity', template: 'weekly_progress', dedupe_key: `t-claim-${uid()}` }).select('id').single(),
      'seed claimable',
    )
    const first = must(await admin.rpc('claim_email_batch', { p_limit: 100 }), 'first claim')
    const mine = first.find((r: { id: string }) => r.id === row.id)
    expect(mine).toBeDefined()
    expect(mine.attempts).toBe(1)
    const second = must(await admin.rpc('claim_email_batch', { p_limit: 100 }), 'second claim')
    expect(second.find((r: { id: string }) => r.id === row.id)).toBeUndefined()

    const denied = await alice.client.rpc('claim_email_batch', { p_limit: 1 })
    expect(denied.error).not.toBeNull()
  })

  it('applies an unsubscribe only to the row that owns the token, and rejects bad input', async () => {
    const aliceRow = must(await admin.from('email_preferences').select('unsubscribe_token').eq('user_id', alice.id).single(), 'alice token')

    expect(await applyPreferenceChange(admin, aliceRow.unsubscribe_token, 'weekly_progress', false)).toEqual({ ok: true })
    const rows = must(await admin.from('email_preferences').select('user_id, weekly_progress').in('user_id', [alice.id, bob.id]), 'rows')
    expect(rows.find((r) => r.user_id === alice.id)?.weekly_progress).toBe(false)
    expect(rows.find((r) => r.user_id === bob.id)?.weekly_progress).toBe(true)

    const unknown = await applyPreferenceChange(admin, '00000000-0000-4000-8000-0000000000aa', 'weekly_progress', false)
    expect(unknown).toMatchObject({ ok: false, status: 404 })
    expect(await applyPreferenceChange(admin, aliceRow.unsubscribe_token, 'not_a_category', false)).toMatchObject({ ok: false, status: 400 })
    expect(await applyPreferenceChange(admin, 'not-a-uuid', 'weekly_progress', false)).toMatchObject({ ok: false, status: 400 })
    expect(await applyPreferenceChange(admin, null, null, false)).toMatchObject({ ok: false, status: 400 })
  })
})
