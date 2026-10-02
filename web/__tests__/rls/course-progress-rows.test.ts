import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, must, seedCourse, type Seed, type TestUser } from './helpers'

describe('course_progress_rows RPC', () => {
  let teacher: TestUser
  let learner: TestUser
  let other: TestUser
  let boss: TestUser
  let seed: Seed

  beforeAll(async () => {
    ;[teacher, learner, other, boss] = await Promise.all([
      createUser('cp-teacher'),
      createUser('cp-learner'),
      createUser('cp-other'),
      createUser('cp-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)
    must(
      await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id }).select(),
      'enroll',
    )
    must(
      await learner.client
        .from('lesson_progress')
        .upsert({ user_id: learner.id, lesson_id: seed.preview.id, progress_percent: 100, completed_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
        .select(),
      'progress',
    )
    // other user: enrolled in a different course owned by someone else, must never leak
    const otherSeed = await seedCourse(other.id)
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: otherSeed.course.id })
  })

  it('returns the enrolled learners and their progress to the course owner', async () => {
    const { data, error } = await teacher.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ user_id: learner.id, lesson_id: seed.preview.id })
    expect(Number(data[0].progress_percent)).toBe(100)
  })

  it('returns a row with no lesson for an enrolled learner without progress', async () => {
    const fresh = await createUser('cp-fresh')
    await fresh.client.from('enrollments').insert({ user_id: fresh.id, course_id: seed.course.id })
    const { data } = await teacher.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    const row = (data as { user_id: string; lesson_id: string | null }[]).find(r => r.user_id === fresh.id)
    expect(row).toBeDefined()
    expect(row?.lesson_id).toBeNull()
  })

  it('works for admins', async () => {
    const { error } = await boss.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(error).toBeNull()
  })

  it('refuses a learner, another teacher and anonymous callers', async () => {
    const asLearner = await learner.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asLearner.error).not.toBeNull()
    expect(asLearner.data).toBeNull()

    const asOther = await other.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asOther.error).not.toBeNull()

    const { anonClient } = await import('./helpers')
    const asAnon = await anonClient().rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asAnon.error).not.toBeNull()
  })
})
