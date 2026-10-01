import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, seedCourse, uid, type Seed, type TestUser } from './helpers'

describe('course review hardening RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let seed: Seed

  async function addLesson(kind: string, position: number): Promise<string> {
    const lesson = must(
      await admin
        .from('lessons')
        .insert({ section_id: seed.section.id, course_id: seed.course.id, title: `L-${kind}`, position, kind })
        .select('id')
        .single(),
      `create ${kind} lesson`,
    )
    return lesson.id
  }

  beforeAll(async () => {
    ;[teacher, learner] = await Promise.all([createUser('hd-teacher'), createUser('hd-learner')])
    seed = await seedCourse(teacher.id)
    must(
      await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id }).select(),
      'enroll learner',
    )
  })

  describe('submissions review fields', () => {
    let lessonId: string
    let submissionId: string

    beforeAll(async () => {
      lessonId = await addLesson('assignment', 10)
    })

    it('ignores review fields a learner supplies on insert', async () => {
      const sub = must(
        await learner.client
          .from('submissions')
          .insert({
            lesson_id: lessonId,
            user_id: learner.id,
            answer_text: 'ma réponse',
            status: 'reviewed',
            grade: 100,
            teacher_feedback: 'Parfait',
            reviewed_at: new Date().toISOString(),
          })
          .select('id, status, grade, teacher_feedback, reviewed_at')
          .single(),
        'learner submit',
      )
      submissionId = sub.id
      expect(sub.status).toBe('submitted')
      expect(sub.grade).toBeNull()
      expect(sub.teacher_feedback).toBeNull()
      expect(sub.reviewed_at).toBeNull()
    })

    it('ignores review fields a learner supplies on update', async () => {
      await learner.client
        .from('submissions')
        .update({ answer_text: 'ma réponse corrigée', grade: 100, status: 'reviewed', teacher_feedback: 'Bravo' })
        .eq('id', submissionId)
      const { data } = await admin
        .from('submissions')
        .select('answer_text, status, grade, teacher_feedback')
        .eq('id', submissionId)
        .single()
      expect(data?.answer_text).toBe('ma réponse corrigée')
      expect(data?.status).toBe('submitted')
      expect(data?.grade).toBeNull()
      expect(data?.teacher_feedback).toBeNull()
    })

    it('still lets the course owner review', async () => {
      const res = await teacher.client
        .from('submissions')
        .update({ status: 'reviewed', grade: 80, teacher_feedback: 'Bien', reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)
      expect(res.error).toBeNull()
      const { data } = await admin.from('submissions').select('status, grade').eq('id', submissionId).single()
      expect(data).toMatchObject({ status: 'reviewed', grade: 80 })
    })
  })

  describe('media_assets', () => {
    let lessonId: string

    beforeAll(async () => {
      lessonId = await addLesson('video', 20)
    })

    it('lets the owner create an uploading asset but not a ready one', async () => {
      const ok = await teacher.client
        .from('media_assets')
        .insert({ owner_id: teacher.id, lesson_id: lessonId, mux_upload_id: `up-${uid()}`, status: 'uploading' })
      expect(ok.error).toBeNull()

      const forged = await teacher.client.from('media_assets').insert({
        owner_id: teacher.id,
        lesson_id: lessonId,
        mux_upload_id: `up-${uid()}`,
        status: 'ready',
        mux_playback_id: 'fake',
      })
      expect(forged.error).not.toBeNull()
    })

    it('does not let the owner rewrite status or duration', async () => {
      const row = must(
        await admin
          .from('media_assets')
          .insert({
            owner_id: teacher.id,
            lesson_id: lessonId,
            mux_upload_id: `up-${uid()}`,
            status: 'ready',
            duration_seconds: 600,
          })
          .select('id')
          .single(),
        'seed ready asset',
      )
      await teacher.client.from('media_assets').update({ duration_seconds: 0 }).eq('id', row.id)
      const { data } = await admin.from('media_assets').select('duration_seconds').eq('id', row.id).single()
      expect(data?.duration_seconds).toBe(600)
    })
  })

  describe('course_orders', () => {
    let paidCourseId: string

    beforeAll(async () => {
      const paid = await seedCourse(teacher.id, { access: 'paid' })
      paidCourseId = paid.course.id
      must(
        await admin
          .from('courses')
          .update({ price_cents: 1000, currency: 'eur', paid_approved: true })
          .eq('id', paidCourseId)
          .select('id'),
        'price paid course',
      )
    })

    const order = (courseId: string, userId: string, extra: Record<string, unknown> = {}) => ({
      user_id: userId,
      course_id: courseId,
      amount_cents: 1000,
      currency: 'eur',
      payment_rail: 'stripe',
      ...extra,
    })

    it('accepts a pending order at the approved price', async () => {
      const res = await learner.client.from('course_orders').insert(order(paidCourseId, learner.id))
      expect(res.error).toBeNull()
    })

    it('rejects a self-completed order', async () => {
      const res = await learner.client
        .from('course_orders')
        .insert(order(paidCourseId, learner.id, { status: 'completed' }))
      expect(res.error).not.toBeNull()
    })

    it('rejects a different amount', async () => {
      const res = await learner.client
        .from('course_orders')
        .insert(order(paidCourseId, learner.id, { amount_cents: 1 }))
      expect(res.error).not.toBeNull()
    })

    it('rejects an order for a free course', async () => {
      const res = await learner.client.from('course_orders').insert(order(seed.course.id, learner.id))
      expect(res.error).not.toBeNull()
    })
  })

  describe('lesson_progress score', () => {
    it('drops a client-supplied score on a text lesson', async () => {
      await learner.client
        .from('lesson_progress')
        .upsert({ user_id: learner.id, lesson_id: seed.preview.id, progress_percent: 100, score: 100 })
      const { data } = await admin
        .from('lesson_progress')
        .select('score')
        .eq('user_id', learner.id)
        .eq('lesson_id', seed.preview.id)
        .single()
      expect(data?.score).toBeNull()
    })

    it('keeps the client-graded score on a fill-in-the-blank lesson', async () => {
      const lessonId = await addLesson('fill_in_blank', 30)
      await learner.client
        .from('lesson_progress')
        .upsert({ user_id: learner.id, lesson_id: lessonId, progress_percent: 85, score: 85 })
      const { data } = await admin
        .from('lesson_progress')
        .select('score')
        .eq('user_id', learner.id)
        .eq('lesson_id', lessonId)
        .single()
      expect(Number(data?.score)).toBe(85)
    })
  })

  describe('submit_quiz', () => {
    let lessonId: string
    let questionId: string
    let rightId: string
    let wrongId: string

    beforeAll(async () => {
      lessonId = await addLesson('quiz', 40)
      questionId = must(
        await admin.from('quiz_questions').insert({ lesson_id: lessonId, prompt: 'Q ?', position: 0 }).select('id').single(),
        'question',
      ).id
      const options = must(
        await admin
          .from('quiz_options')
          .insert([
            { question_id: questionId, text: 'juste', position: 0 },
            { question_id: questionId, text: 'faux', position: 1 },
          ])
          .select('id, text'),
        'options',
      )
      rightId = options.find(o => o.text === 'juste')!.id
      wrongId = options.find(o => o.text === 'faux')!.id
      must(
        await admin
          .from('quiz_answer_keys')
          .insert({ question_id: questionId, correct_option_ids: [rightId], explanation: 'Parce que.' })
          .select('question_id'),
        'answer key',
      )
    })

    it('hides the answer key on a failed attempt', async () => {
      const { data, error } = await learner.client.rpc('submit_quiz', {
        p_lesson_id: lessonId,
        p_answers: { [questionId]: [wrongId] },
      })
      expect(error).toBeNull()
      expect(data.passed).toBe(false)
      expect(data.details[0]).not.toHaveProperty('correct_option_ids')
      expect(data.details[0].is_correct).toBe(false)
    })

    it('reveals the key and records the server-computed score on a pass', async () => {
      const { data, error } = await learner.client.rpc('submit_quiz', {
        p_lesson_id: lessonId,
        p_answers: { [questionId]: [rightId] },
      })
      expect(error).toBeNull()
      expect(data.passed).toBe(true)
      expect(data.details[0].correct_option_ids).toEqual([rightId])

      const { data: progress } = await admin
        .from('lesson_progress')
        .select('score, progress_percent')
        .eq('user_id', learner.id)
        .eq('lesson_id', lessonId)
        .single()
      expect(Number(progress?.score)).toBe(100)
      expect(Number(progress?.progress_percent)).toBe(100)
    })

    it('refuses a quiz that has a question without an answer key', async () => {
      await admin.from('quiz_questions').insert({ lesson_id: lessonId, prompt: 'Sans clé ?', position: 1 })
      const { error } = await learner.client.rpc('submit_quiz', {
        p_lesson_id: lessonId,
        p_answers: { [questionId]: [rightId] },
      })
      expect(error?.message).toContain('incomplete')
    })
  })
})
