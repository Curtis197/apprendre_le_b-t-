import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 2 audio & quiz RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let quizLessonId: string
  let questionId: string
  let optA: string
  let optB: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p2-teacher'),
      createUser('p2-learner'),
      createUser('p2-outsider'),
      createUser('p2-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create a quiz lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Quiz de vocabulaire',
        position: 2,
        kind: 'quiz',
        is_preview: false,
      }).select('id').single(),
      'create quiz lesson',
    )
    quizLessonId = lesson.id

    // Create a quiz question
    const q = must(
      await admin.from('quiz_questions').insert({
        lesson_id: quizLessonId,
        prompt: 'Comment dit-on "bonjour" ?',
        position: 0,
      }).select('id').single(),
      'create quiz question',
    )
    questionId = q.id

    // Create two options
    const o1 = must(
      await admin.from('quiz_options').insert({ question_id: questionId, text: 'Akwaba', position: 0 }).select('id').single(),
      'opt1',
    )
    const o2 = must(
      await admin.from('quiz_options').insert({ question_id: questionId, text: 'A té bété', position: 1 }).select('id').single(),
      'opt2',
    )
    optA = o1.id
    optB = o2.id

    // Set correct answer key (optA is correct)
    const key = await admin.from('quiz_answer_keys').insert({
      question_id: questionId,
      correct_option_ids: [optA],
      explanation: 'Akwaba est la salutation de bienvenue.',
    })
    if (key.error) throw new Error(key.error.message)
  })

  describe('quiz questions and options visibility', () => {
    it('allows an enrolled learner to read quiz questions and options', async () => {
      const q = await learner.client.from('quiz_questions').select('id, prompt').eq('lesson_id', quizLessonId)
      expect(q.error).toBeNull()
      expect(q.data).toHaveLength(1)

      const opts = await learner.client.from('quiz_options').select('id, text').eq('question_id', questionId)
      expect(opts.error).toBeNull()
      expect(opts.data).toHaveLength(2)
    })

    it('denies locked quiz questions to non-enrolled users', async () => {
      const q = await outsider.client.from('quiz_questions').select('id').eq('lesson_id', quizLessonId)
      expect(q.data).toEqual([])
    })

    it('NEVER reveals quiz answer keys to learners', async () => {
      const { data } = await learner.client.from('quiz_answer_keys').select('*').eq('question_id', questionId)
      expect(data).toEqual([])
    })

    it('allows the course owner to read the answer keys', async () => {
      const { data } = await teacher.client.from('quiz_answer_keys').select('explanation').eq('question_id', questionId)
      expect(data).toEqual([{ explanation: 'Akwaba est la salutation de bienvenue.' }])
    })
  })

  describe('quiz grading via submit_quiz() RPC', () => {
    it('evaluates answers correctly, scores 100%, and records lesson progress on pass', async () => {
      const res = await learner.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optA] },
      })
      expect(res.error).toBeNull()
      expect(res.data.score).toBe(100)
      expect(res.data.passed).toBe(true)
      expect(res.data.details[0].is_correct).toBe(true)
      expect(res.data.details[0].explanation).toBe('Akwaba est la salutation de bienvenue.')

      // Check progress recorded
      const progress = await learner.client.from('lesson_progress').select('score').eq('lesson_id', quizLessonId)
      expect(progress.data?.[0].score).toBe(100)
    })

    it('evaluates wrong answers, scores 0%, and fails without recording progress', async () => {
      // Clear previous progress
      await admin.from('lesson_progress').delete().eq('user_id', learner.id).eq('lesson_id', quizLessonId)

      const res = await learner.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optB] },
      })
      expect(res.error).toBeNull()
      expect(res.data.score).toBe(0)
      expect(res.data.passed).toBe(false)
      expect(res.data.details[0].is_correct).toBe(false)

      // Confirm no progress recorded
      const progress = await learner.client.from('lesson_progress').select('score').eq('lesson_id', quizLessonId)
      expect(progress.data).toEqual([])
    })

    it('rejects quiz submission from users without access to the lesson', async () => {
      const res = await outsider.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optA] },
      })
      expect(res.error).not.toBeNull()
    })
  })
})
