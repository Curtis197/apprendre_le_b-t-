import { beforeAll, describe, expect, it } from 'vitest'
import {
  admin,
  anonClient,
  createUser,
  makeAdmin,
  seedCourse,
  uid,
  type Seed,
  type TestUser,
} from './helpers'

describe('courses core RLS', () => {
  let teacher: TestUser
  let other: TestUser
  let learner: TestUser
  let boss: TestUser
  let published: Seed
  let draft: Seed

  beforeAll(async () => {
    ;[teacher, other, learner, boss] = await Promise.all([
      createUser('teacher'),
      createUser('other'),
      createUser('learner'),
      createUser('boss'),
    ])
    await makeAdmin(boss.id)
    published = await seedCourse(teacher.id)
    draft = await seedCourse(teacher.id, { status: 'draft' })
  })

  describe('visibility', () => {
    it('shows published courses to anonymous visitors but hides drafts', async () => {
      const { data } = await anonClient()
        .from('courses')
        .select('id')
        .in('id', [published.course.id, draft.course.id])
      expect(data).toEqual([{ id: published.course.id }])
    })

    it('exposes the outline of published courses only', async () => {
      const anon = anonClient()
      const sections = await anon.from('course_sections').select('id').eq('course_id', published.course.id)
      const lessons = await anon.from('lessons').select('id').eq('course_id', published.course.id)
      const draftLessons = await anon.from('lessons').select('id').eq('course_id', draft.course.id)
      expect(sections.data).toHaveLength(1)
      expect(lessons.data).toHaveLength(2)
      expect(draftLessons.data).toEqual([])
    })

    it('lets the owner see their own draft and hides it from other users', async () => {
      const own = await teacher.client.from('courses').select('id').eq('id', draft.course.id)
      const foreign = await other.client.from('courses').select('id').eq('id', draft.course.id)
      expect(own.data).toEqual([{ id: draft.course.id }])
      expect(foreign.data).toEqual([])
    })

    it('lets an admin see every course', async () => {
      const { data } = await boss.client.from('courses').select('id').eq('id', draft.course.id)
      expect(data).toEqual([{ id: draft.course.id }])
    })
  })

  describe('lesson content', () => {
    it('serves preview lessons to anonymous visitors and withholds locked ones', async () => {
      const anon = anonClient()
      const preview = await anon.from('lesson_contents').select('body_md').eq('lesson_id', published.preview.id)
      const locked = await anon.from('lesson_contents').select('body_md').eq('lesson_id', published.locked.id)
      expect(preview.data).toEqual([{ body_md: 'contenu aperçu' }])
      expect(locked.data).toEqual([])
    })

    it('withholds locked lessons from signed-in users who are not enrolled', async () => {
      const { data } = await other.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', published.locked.id)
      expect(data).toEqual([])
    })

    it('serves locked lessons after enrollment', async () => {
      const enrolled = await learner.client
        .from('enrollments')
        .insert({ user_id: learner.id, course_id: published.course.id })
      expect(enrolled.error).toBeNull()
      const { data } = await learner.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', published.locked.id)
      expect(data).toEqual([{ body_md: 'contenu verrouillé' }])
    })

    it('never serves the content of a draft course to other users, but does to its owner', async () => {
      const foreign = await other.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', draft.preview.id)
      const own = await teacher.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', draft.preview.id)
      expect(foreign.data).toEqual([])
      expect(own.data).toEqual([{ body_md: 'contenu aperçu' }])
    })
  })

  describe('enrollment', () => {
    it('refuses enrollment in a draft course', async () => {
      const user = await createUser('enrollee')
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: user.id, course_id: draft.course.id })
      expect(error).not.toBeNull()
    })

    it('refuses enrollment in a paid course', async () => {
      const user = await createUser('enrollee')
      const paid = await seedCourse(teacher.id, { access: 'paid' })
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: user.id, course_id: paid.course.id })
      expect(error).not.toBeNull()
    })

    it('refuses enrollment on behalf of another user', async () => {
      const user = await createUser('enrollee')
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: other.id, course_id: published.course.id })
      expect(error).not.toBeNull()
    })

    it('keeps enrollments private', async () => {
      const { data } = await other.client.from('enrollments').select('user_id').eq('user_id', learner.id)
      expect(data).toEqual([])
    })
  })

  describe('authoring', () => {
    const base = () => ({ owner_id: teacher.id, title: 'Mon cours', slug: `c-${uid()}` })

    it('lets any signed-in user create a free draft course', async () => {
      const { data, error } = await teacher.client.from('courses').insert(base()).select('status, access').single()
      expect(error).toBeNull()
      expect(data).toEqual({ status: 'draft', access: 'free' })
    })

    it('refuses paid, pre-published or foreign-owned inserts', async () => {
      const paid = await teacher.client.from('courses').insert({ ...base(), access: 'paid' })
      const live = await teacher.client.from('courses').insert({ ...base(), status: 'published' })
      const foreign = await teacher.client.from('courses').insert({ ...base(), owner_id: other.id })
      expect(paid.error).not.toBeNull()
      expect(live.error).not.toBeNull()
      expect(foreign.error).not.toBeNull()
    })

    it('refuses course creation by anonymous visitors', async () => {
      const { error } = await anonClient().from('courses').insert(base())
      expect(error).not.toBeNull()
    })

    it('refuses edits of a course by a non-owner', async () => {
      const { data } = await other.client
        .from('courses')
        .update({ title: 'Piraté' })
        .eq('id', published.course.id)
        .select('id')
      expect(data).toEqual([])
      const check = await admin.from('courses').select('title').eq('id', published.course.id).single()
      expect(check.data?.title).toBe('Cours de test')
    })

    it('lets the owner unpublish and republish', async () => {
      const seed = await seedCourse(teacher.id)
      const down = await teacher.client.from('courses').update({ status: 'draft' }).eq('id', seed.course.id).select('status')
      const up = await teacher.client.from('courses').update({ status: 'published' }).eq('id', seed.course.id).select('status')
      expect(down.data).toEqual([{ status: 'draft' }])
      expect(up.data).toEqual([{ status: 'published' }])
    })

    it('refuses owner attempts to suspend a course or make it paid', async () => {
      const seed = await seedCourse(teacher.id)
      const suspend = await teacher.client.from('courses').update({ status: 'suspended' }).eq('id', seed.course.id)
      const paid = await teacher.client.from('courses').update({ access: 'paid' }).eq('id', seed.course.id)
      expect(suspend.error).not.toBeNull()
      expect(paid.error).not.toBeNull()
    })

    it('refuses sections and lessons in someone else’s course', async () => {
      const section = await other.client
        .from('course_sections')
        .insert({ course_id: published.course.id, title: 'x', position: 9 })
      const lesson = await other.client
        .from('lessons')
        .insert({ section_id: published.section.id, course_id: published.course.id, title: 'x', position: 9 })
      expect(section.error).not.toBeNull()
      expect(lesson.error).not.toBeNull()
    })

    it('keeps a lesson in the same course as its section', async () => {
      const { error } = await teacher.client
        .from('lessons')
        .insert({ section_id: published.section.id, course_id: draft.course.id, title: 'x', position: 9 })
      expect(error).not.toBeNull()
    })

    it('creates an empty content row for every new lesson', async () => {
      const inserted = await teacher.client
        .from('lessons')
        .insert({ section_id: draft.section.id, course_id: draft.course.id, title: 'Nouvelle leçon', position: 5 })
        .select('id')
        .single()
      expect(inserted.error).toBeNull()
      const content = await teacher.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', inserted.data?.id)
        .single()
      expect(content.data).toEqual({ body_md: '' })
    })

    it('lets the owner delete a draft but not a published course', async () => {
      const draftSeed = await seedCourse(teacher.id, { status: 'draft' })
      const pubSeed = await seedCourse(teacher.id)
      const deletedDraft = await teacher.client.from('courses').delete().eq('id', draftSeed.course.id).select('id')
      const deletedPub = await teacher.client.from('courses').delete().eq('id', pubSeed.course.id).select('id')
      expect(deletedDraft.data).toEqual([{ id: draftSeed.course.id }])
      expect(deletedPub.data).toEqual([])
    })
  })

  describe('admin and moderation', () => {
    it('reports admin status through is_admin()', async () => {
      expect((await boss.client.rpc('is_admin')).data).toBe(true)
      expect((await other.client.rpc('is_admin')).data).toBe(false)
      expect((await anonClient().rpc('is_admin')).data).toBe(false)
    })

    it('keeps user_roles closed to clients', async () => {
      const read = await other.client.from('user_roles').select('user_id')
      const write = await other.client.from('user_roles').insert({ user_id: other.id, role: 'admin' })
      expect(read.data).toEqual([])
      expect(write.error).not.toBeNull()
    })

    it('lets an admin suspend a course, freezing the owner and blocking learners', async () => {
      const seed = await seedCourse(teacher.id)
      const student = await createUser('student')
      await student.client.from('enrollments').insert({ user_id: student.id, course_id: seed.course.id })

      const suspended = await boss.client.from('courses').update({ status: 'suspended' }).eq('id', seed.course.id)
      expect(suspended.error).toBeNull()

      const edit = await teacher.client.from('courses').update({ title: 'Nouveau titre' }).eq('id', seed.course.id).select('id')
      const addSection = await teacher.client
        .from('course_sections')
        .insert({ course_id: seed.course.id, title: 'x', position: 9 })
      const read = await student.client.from('lesson_contents').select('body_md').eq('lesson_id', seed.locked.id)
      const ownView = await teacher.client.from('courses').select('status').eq('id', seed.course.id).single()

      expect(edit.data).toEqual([])
      expect(addSection.error).not.toBeNull()
      expect(read.data).toEqual([])
      expect(ownView.data?.status).toBe('suspended')
    })

    it('lets an admin restore a suspended course to draft', async () => {
      const seed = await seedCourse(teacher.id, { status: 'suspended' })
      const restored = await boss.client
        .from('courses')
        .update({ status: 'draft' })
        .eq('id', seed.course.id)
        .select('status')
        .single()
      expect(restored.data?.status).toBe('draft')
      const edit = await teacher.client.from('courses').update({ title: 'Repris' }).eq('id', seed.course.id).select('id')
      expect(edit.data).toEqual([{ id: seed.course.id }])
    })
  })
})
