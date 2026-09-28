import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 3 video assets & quotas RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let videoLessonId: string
  let mediaAssetId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p3-teacher'),
      createUser('p3-learner'),
      createUser('p3-outsider'),
      createUser('p3-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create a video lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Introduction en Vidéo',
        position: 3,
        kind: 'video',
        is_preview: false,
      }).select('id').single(),
      'create video lesson',
    )
    videoLessonId = lesson.id

    // Insert a media asset as teacher
    const nonce = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const asset = must(
      await teacher.client.from('media_assets').insert({
        owner_id: teacher.id,
        lesson_id: videoLessonId,
        mux_upload_id: `upload_test_${nonce}`,
        mux_asset_id: `asset_test_${nonce}`,
        mux_playback_id: `playback_test_${nonce}`,
        duration_seconds: 120,
        status: 'ready',
      }).select('id, mux_playback_id').single(),
      'create media asset',
    )
    mediaAssetId = asset.id
  })

  describe('media_assets visibility', () => {
    it('allows an enrolled learner to read ready video media assets', async () => {
      const { data, error } = await learner.client
        .from('media_assets')
        .select('mux_playback_id, duration_seconds, status')
        .eq('id', mediaAssetId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].mux_playback_id).toBeTruthy()
    })

    it('denies locked video media assets to non-enrolled users', async () => {
      const { data } = await outsider.client
        .from('media_assets')
        .select('id')
        .eq('id', mediaAssetId)

      expect(data).toEqual([])
    })

    it('allows course owner to update media asset status', async () => {
      const res = await teacher.client
        .from('media_assets')
        .update({ duration_seconds: 180 })
        .eq('id', mediaAssetId)

      expect(res.error).toBeNull()
    })
  })

  describe('video_quotas & RPC get_user_video_quota()', () => {
    it('returns default 30 minutes quota and tracks used seconds for teacher', async () => {
      const { data, error } = await teacher.client.rpc('get_user_video_quota', { p_user_id: teacher.id })
      expect(error).toBeNull()
      expect(data?.[0].max_minutes).toBe(30)
      expect(data?.[0].used_seconds).toBe(180)
    })

    it('allows admin to increase a teacher video quota', async () => {
      const res = await boss.client
        .from('video_quotas')
        .upsert({ user_id: teacher.id, max_minutes: 120 })

      expect(res.error).toBeNull()

      const { data } = await teacher.client.rpc('get_user_video_quota', { p_user_id: teacher.id })
      expect(data?.[0].max_minutes).toBe(120)
    })
  })
})
