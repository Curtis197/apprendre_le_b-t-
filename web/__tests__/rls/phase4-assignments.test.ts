import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 4 assignments & submissions RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let assignmentLessonId: string
  let submissionId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p4-teacher'),
      createUser('p4-learner'),
      createUser('p4-outsider'),
      createUser('p4-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create an assignment lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Devoir : Traduire une phrase',
        position: 4,
        kind: 'assignment',
        is_preview: false,
      }).select('id').single(),
      'create assignment lesson',
    )
    assignmentLessonId = lesson.id

    // Submit assignment as learner
    const sub = must(
      await learner.client.from('submissions').insert({
        lesson_id: assignmentLessonId,
        user_id: learner.id,
        answer_text: 'Voici ma réponse en bété.',
        status: 'submitted',
      }).select('id').single(),
      'submit assignment',
    )
    submissionId = sub.id
  })

  describe('submissions RLS visibility & mutations', () => {
    it('allows learner to read their own submission', async () => {
      const { data, error } = await learner.client
        .from('submissions')
        .select('answer_text, status')
        .eq('id', submissionId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].answer_text).toBe('Voici ma réponse en bété.')
    })

    it('denies outsider from reading learner submission', async () => {
      const { data } = await outsider.client
        .from('submissions')
        .select('id')
        .eq('id', submissionId)

      expect(data).toEqual([])
    })

    it('allows course teacher to read submissions for their course', async () => {
      const { data, error } = await teacher.client
        .from('submissions')
        .select('id, user_id, answer_text')
        .eq('id', submissionId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('allows course teacher to review submission and assign grade', async () => {
      const res = await teacher.client
        .from('submissions')
        .update({
          status: 'reviewed',
          teacher_feedback: 'Très bon travail !',
          grade: 95,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      expect(res.error).toBeNull()

      const { data } = await learner.client
        .from('submissions')
        .select('status, teacher_feedback, grade')
        .eq('id', submissionId)
        .single()

      expect(data?.status).toBe('reviewed')
      expect(data?.teacher_feedback).toBe('Très bon travail !')
      expect(data?.grade).toBe(95)
    })
  })
})
