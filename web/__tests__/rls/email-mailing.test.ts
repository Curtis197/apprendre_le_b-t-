import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, seedCourse, uid, type Seed, type TestUser } from './helpers'
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

describe('email triggers', () => {
  let teacher: TestUser
  let l1: TestUser
  let l2: TestUser
  let seed: Seed

  const outbox = async (userId: string, template: string) =>
    must(await admin.from('email_outbox').select('dedupe_key, payload, category').eq('user_id', userId).eq('template', template), `outbox ${template}`)

  async function newCourse(ownerId: string) {
    return must(
      await admin.from('courses').insert({ owner_id: ownerId, title: `Cours ${uid()}`, slug: `c-${uid()}`, summary: 'Résumé', status: 'draft' }).select('id').single(),
      'create course',
    )
  }

  beforeAll(async () => {
    ;[teacher, l1, l2] = await Promise.all([createUser('tr-teacher'), createUser('tr-l1'), createUser('tr-l2')])
    seed = await seedCourse(teacher.id)
    await admin.from('courses').update({ status: 'published' }).eq('id', seed.course.id)
    must(await admin.from('enrollments').insert([{ user_id: l1.id, course_id: seed.course.id }, { user_id: teacher.id, course_id: seed.course.id }]).select(), 'enroll')
  })

  it('announces a newly published course to earlier learners of the same teacher, once, never to the author', async () => {
    const course = await newCourse(teacher.id)
    expect(await outbox(l1.id, 'new_course')).toHaveLength(0)

    must(await admin.from('courses').update({ status: 'published' }).eq('id', course.id).select(), 'publish')
    const rows = await outbox(l1.id, 'new_course')
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('teacher_announcements')
    expect(rows[0].dedupe_key).toBe(`new_course:${course.id}:${l1.id}`)
    expect(rows[0].payload.course_slug).toMatch(/^c-/)

    // Replay: unpublish then publish again must not queue a second row.
    await admin.from('courses').update({ status: 'draft' }).eq('id', course.id)
    await admin.from('courses').update({ status: 'published' }).eq('id', course.id)
    expect(await outbox(l1.id, 'new_course')).toHaveLength(1)

    expect(await outbox(l2.id, 'new_course')).toHaveLength(0)
    expect(await outbox(teacher.id, 'new_course')).toHaveLength(0)
  })

  it('queues one email to the teacher when a learner submits, and one to the learner when it is reviewed', async () => {
    const lesson = must(
      await admin.from('lessons').insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'Devoir', position: 50, kind: 'assignment' }).select('id').single(),
      'lesson',
    )
    const sub = must(
      await l1.client.from('submissions').insert({ lesson_id: lesson.id, user_id: l1.id, answer_text: 'ma réponse' }).select('id').single(),
      'submit',
    )
    const received = (await outbox(teacher.id, 'submission_received')).filter((r) => r.dedupe_key === `submitted:${sub.id}`)
    expect(received).toHaveLength(1)
    expect(await outbox(l1.id, 'submission_reviewed')).toHaveLength(0)

    const reviewedAt = new Date().toISOString()
    must(
      await teacher.client.from('submissions').update({ status: 'reviewed', teacher_feedback: 'Bien joué', grade: 80, reviewed_at: reviewedAt }).eq('id', sub.id).select(),
      'review',
    )
    const reviewed = (await outbox(l1.id, 'submission_reviewed')).filter((r) => r.payload.submission_id === sub.id)
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0].payload.feedback).toBe('Bien joué')
    expect(reviewed[0].payload.grade).toBe(80)

    // Editing the feedback with the same reviewed_at must not queue a duplicate.
    await teacher.client.from('submissions').update({ teacher_feedback: 'Très bien joué', reviewed_at: reviewedAt }).eq('id', sub.id)
    expect((await outbox(l1.id, 'submission_reviewed')).filter((r) => r.payload.submission_id === sub.id)).toHaveLength(1)
  })
})

describe('weekly digest', () => {
  let teacher: TestUser
  let active: TestUser
  let idle: TestUser

  const mondayOf = (d: Date): string => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
    return x.toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    ;[teacher, active, idle] = await Promise.all([createUser('dg-teacher'), createUser('dg-active'), createUser('dg-idle')])
  })

  it('queues one digest per active learner for the week, none for idle learners, and is idempotent', async () => {
    const seed = await seedCourse(teacher.id)
    const lesson = must(
      await admin.from('lessons').insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'L1', position: 1, kind: 'text' }).select('id').single(),
      'lesson',
    )
    const doneAt = new Date(Date.now() - 3 * 86_400_000)
    must(await admin.from('lesson_progress').insert({ user_id: active.id, lesson_id: lesson.id, completed_at: doneAt.toISOString(), score: 90 }).select(), 'progress')
    const week = mondayOf(doneAt)

    const first = must(await admin.rpc('enqueue_weekly_digest', { p_week_start: week }), 'digest 1')
    expect(first).toBeGreaterThanOrEqual(1)
    const rows = must(await admin.from('email_outbox').select('user_id, payload, category').eq('dedupe_key', `digest:${week}:${active.id}`), 'digest row')
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('weekly_progress')
    expect(rows[0].payload.lessons_completed).toBe(1)
    // seedCourse already creates lessons, so compare against the real count rather than assuming 1.
    const { count: totalLessons } = await admin.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', seed.course.id)
    expect(rows[0].payload.courses[0]).toMatchObject({ completed_this_week: 1, completed_total: 1, total_lessons: totalLessons })

    const idleRows = must(await admin.from('email_outbox').select('id').eq('dedupe_key', `digest:${week}:${idle.id}`), 'idle rows')
    expect(idleRows).toHaveLength(0)

    must(await admin.rpc('enqueue_weekly_digest', { p_week_start: week }), 'digest 2')
    const again = must(await admin.from('email_outbox').select('id').eq('dedupe_key', `digest:${week}:${active.id}`), 'digest again')
    expect(again).toHaveLength(1)
  })

  it('refuses signed-in users calling the digest function', async () => {
    const { error } = await active.client.rpc('enqueue_weekly_digest', { p_week_start: '2026-01-05' })
    expect(error).not.toBeNull()
  })
})
