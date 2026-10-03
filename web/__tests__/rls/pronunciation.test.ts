import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, seedCourse, type Seed, type TestUser } from './helpers'

describe('pronunciation lessons RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let seed: Seed
  let lessonId: string

  async function progressRow() {
    const { data } = await admin
      .from('lesson_progress')
      .select('progress_percent, completed_at')
      .eq('user_id', learner.id)
      .eq('lesson_id', lessonId)
    return data ?? []
  }

  beforeAll(async () => {
    ;[teacher, learner] = await Promise.all([createUser('pr-teacher'), createUser('pr-learner')])
    seed = await seedCourse(teacher.id)
    must(
      await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id }).select(),
      'enroll learner',
    )
    const lesson = must(
      await admin
        .from('lessons')
        .insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'Dire Awa', position: 20, kind: 'pronunciation' })
        .select('id')
        .single(),
      'create pronunciation lesson',
    )
    lessonId = lesson.id
  })

  it('refuses a client-written completion for a pronunciation lesson', async () => {
    const { error } = await learner.client
      .from('lesson_progress')
      .upsert({ user_id: learner.id, lesson_id: lessonId, progress_percent: 100, completed_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
    expect(error).not.toBeNull()
    expect(await progressRow()).toHaveLength(0)
  })

  let submissionId: string
  it('lets the learner submit a recording path, forcing status to submitted', async () => {
    const sub = must(
      await learner.client
        .from('submissions')
        .insert({ lesson_id: lessonId, user_id: learner.id, audio_path: `${learner.id}/${lessonId}/1.webm`, status: 'validated' })
        .select('id, status')
        .single(),
      'submit recording',
    )
    submissionId = sub.id
    expect(sub.status).toBe('submitted')
    expect(await progressRow()).toHaveLength(0)
  })

  it('does not let the learner validate their own recording', async () => {
    await learner.client.from('submissions').update({ status: 'validated' }).eq('id', submissionId)
    const { data } = await admin.from('submissions').select('status').eq('id', submissionId).single()
    expect(data?.status).toBe('submitted')
    expect(await progressRow()).toHaveLength(0)
  })

  it('completes the lesson when the teacher validates', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'validated', teacher_feedback: 'Très bien', reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)
        .select('id')
        .single(),
      'teacher validates',
    )
    const rows = await progressRow()
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].progress_percent)).toBe(100)
    expect(rows[0].completed_at).not.toBeNull()
  })

  it('freezes a validated submission for the learner', async () => {
    const { data } = await learner.client
      .from('submissions')
      .update({ audio_path: `${learner.id}/${lessonId}/2.webm` })
      .eq('id', submissionId)
      .select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('does not let the learner delete their validated progress', async () => {
    await learner.client.from('lesson_progress').delete().eq('user_id', learner.id).eq('lesson_id', lessonId)
    expect(await progressRow()).toHaveLength(1)
  })

  it('revokes completion when the teacher reverses the decision', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'needs_retry', teacher_feedback: 'Reprenez la voyelle finale' })
        .eq('id', submissionId)
        .select('id')
        .single(),
      'teacher reverses',
    )
    expect(await progressRow()).toHaveLength(0)
  })

  it('lets the learner re-record after needs_retry, resetting review fields', async () => {
    const { data, error } = await learner.client
      .from('submissions')
      .update({ audio_path: `${learner.id}/${lessonId}/3.webm` })
      .eq('id', submissionId)
      .select('status, teacher_feedback, grade, reviewed_at')
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'submitted', teacher_feedback: null, grade: null, reviewed_at: null })
  })

  it('still lets the teacher delete a lesson that has submissions and progress', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'validated', teacher_feedback: 'OK' })
        .eq('id', submissionId)
        .select('id')
        .single(),
      're-validate',
    )
    expect(await progressRow()).toHaveLength(1)
    const { error } = await teacher.client.from('lessons').delete().eq('id', lessonId)
    expect(error).toBeNull()
    expect(await progressRow()).toHaveLength(0)
  })
})

describe('pronunciation-submissions bucket', () => {
  it('exists, is private and accepts webm, mp4 and ogg audio', async () => {
    const { data, error } = await admin.storage.getBucket('pronunciation-submissions')
    expect(error).toBeNull()
    expect(data?.public).toBe(false)
    expect(data?.allowed_mime_types).toEqual(expect.arrayContaining(['audio/webm', 'audio/mp4', 'audio/ogg']))
  })
})
