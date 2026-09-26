import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, type Seed, type TestUser } from './helpers'

describe('lesson_progress RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let other: TestUser
  let seed: Seed

  beforeAll(async () => {
    ;[teacher, learner, other] = await Promise.all([
      createUser('teacher'),
      createUser('learner'),
      createUser('other'),
    ])
    seed = await seedCourse(teacher.id)
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })
  })

  it('lets an enrolled learner mark a locked lesson complete and read it back', async () => {
    const inserted = await learner.client
      .from('lesson_progress')
      .insert({ user_id: learner.id, lesson_id: seed.locked.id })
    expect(inserted.error).toBeNull()
    const { data } = await learner.client.from('lesson_progress').select('lesson_id').eq('user_id', learner.id)
    expect(data).toEqual([{ lesson_id: seed.locked.id }])
  })

  it('refuses progress on a locked lesson without enrollment', async () => {
    const { error } = await other.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.locked.id })
    expect(error).not.toBeNull()
  })

  it('allows progress on a preview lesson without enrollment', async () => {
    const { error } = await other.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.preview.id })
    expect(error).toBeNull()
  })

  it('refuses progress recorded for another user', async () => {
    const { error } = await learner.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.preview.id })
    expect(error).not.toBeNull()
  })

  it('keeps progress private', async () => {
    const { data } = await other.client.from('lesson_progress').select('lesson_id').eq('user_id', learner.id)
    expect(data).toEqual([])
  })

  it('lets a user undo their own progress', async () => {
    const { data } = await learner.client
      .from('lesson_progress')
      .delete()
      .eq('user_id', learner.id)
      .eq('lesson_id', seed.locked.id)
      .select('lesson_id')
    expect(data).toEqual([{ lesson_id: seed.locked.id }])
  })
})

describe('course_reports RLS', () => {
  let teacher: TestUser
  let reporter: TestUser
  let boss: TestUser
  let published: Seed
  let draft: Seed

  beforeAll(async () => {
    ;[teacher, reporter, boss] = await Promise.all([
      createUser('teacher'),
      createUser('reporter'),
      createUser('boss'),
    ])
    await makeAdmin(boss.id)
    published = await seedCourse(teacher.id)
    draft = await seedCourse(teacher.id, { status: 'draft' })
  })

  it('lets a signed-in user report a published course once', async () => {
    const first = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: reporter.id, reason: 'Contenu inapproprié' })
    const second = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: reporter.id, reason: 'Encore une fois' })
    expect(first.error).toBeNull()
    expect(second.error?.code).toBe('23505')
  })

  it('refuses reports on draft courses and reports filed for someone else', async () => {
    const onDraft = await reporter.client
      .from('course_reports')
      .insert({ course_id: draft.course.id, reporter_id: reporter.id, reason: 'Contenu inapproprié' })
    const forged = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: boss.id, reason: 'Contenu inapproprié' })
    expect(onDraft.error).not.toBeNull()
    expect(forged.error).not.toBeNull()
  })

  it('keeps reports invisible to non-admins', async () => {
    const { data } = await reporter.client.from('course_reports').select('id')
    expect(data).toEqual([])
  })

  it('lets an admin read and resolve reports', async () => {
    const open = await boss.client
      .from('course_reports')
      .select('id, resolved_at')
      .eq('course_id', published.course.id)
    expect(open.data).toHaveLength(1)
    expect(open.data?.[0].resolved_at).toBeNull()

    const resolved = await boss.client
      .from('course_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('course_id', published.course.id)
      .select('id')
    expect(resolved.data).toHaveLength(1)
  })

  it('refuses report resolution by non-admins', async () => {
    const { data } = await reporter.client
      .from('course_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('course_id', published.course.id)
      .select('id')
    expect(data).toEqual([])
    const check = await admin.from('course_reports').select('resolved_at').eq('course_id', published.course.id)
    expect(check.data).toHaveLength(1)
  })
})
