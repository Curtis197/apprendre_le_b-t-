import 'server-only'
// lib/courses/queries.ts — server-side reads for the course platform.
// Visibility is decided by RLS: an anonymous client sees published courses,
// a signed-in client additionally sees its own, enrolled and (admins) all courses.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DialectKey } from '../dialect'
import { buildOutline, computeProgress, type Progress } from './outline'
import type { QuizAnswerKey, QuizOption, QuizQuestion } from './quiz'
import type { Course, CourseLevel, Lesson, OutlineSection, Section } from './types'
import type { MediaAsset, VideoQuota } from './video'
import { generateMuxPlaybackToken } from './video'
import type { Submission, PendingReviewItem } from './assignment'
import type { CourseOrder } from './payment'

export async function getPublishedCourses(
  client: SupabaseClient,
  filters: { dialect?: DialectKey | null; level?: CourseLevel | null } = {},
  limit = 60,
): Promise<Course[]> {
  let query = client
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.dialect) query = query.eq('dialect', filters.dialect)
  if (filters.level) query = query.eq('level', filters.level)
  const { data } = await query
  return (data ?? []) as Course[]
}

export async function getCourseBySlug(client: SupabaseClient, slug: string): Promise<Course | null> {
  const { data } = await client.from('courses').select('*').eq('slug', slug).maybeSingle()
  return (data ?? null) as Course | null
}

export async function getCourseById(client: SupabaseClient, id: string): Promise<Course | null> {
  const { data } = await client.from('courses').select('*').eq('id', id).maybeSingle()
  return (data ?? null) as Course | null
}

export async function getCourseOutline(client: SupabaseClient, courseId: string): Promise<OutlineSection[]> {
  const [sections, lessons] = await Promise.all([
    client.from('course_sections').select('*').eq('course_id', courseId).order('position'),
    client.from('lessons').select('*').eq('course_id', courseId).order('position'),
  ])
  return buildOutline((sections.data ?? []) as Section[], (lessons.data ?? []) as Lesson[])
}

/** The lesson body, or null when RLS withholds it (not enrolled, not a preview, suspended…). */
export async function getLessonContent(client: SupabaseClient, lessonId: string): Promise<string | null> {
  const { data } = await client
    .from('lesson_contents')
    .select('body_md')
    .eq('lesson_id', lessonId)
    .maybeSingle()
  return data ? (data as { body_md: string }).body_md : null
}

export async function getCompletedLessonIds(
  client: SupabaseClient,
  userId: string,
  lessonIds: string[],
): Promise<string[]> {
  if (lessonIds.length === 0) return []
  const { data } = await client
    .from('lesson_progress')
    .select('lesson_id, progress_percent, completed_at')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds)
  return ((data ?? []) as { lesson_id: string; progress_percent?: number; completed_at?: string | null }[])
    .filter(row => (row.progress_percent ?? 0) >= 100 || Boolean(row.completed_at))
    .map(row => row.lesson_id)
}

export async function getLessonProgressMap(
  client: SupabaseClient,
  userId: string,
  lessonIds: string[],
): Promise<Record<string, { progress_percent: number; score: number | null; completed: boolean }>> {
  if (lessonIds.length === 0) return {}
  const { data } = await client
    .from('lesson_progress')
    .select('lesson_id, progress_percent, score, completed_at')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds)

  const map: Record<string, { progress_percent: number; score: number | null; completed: boolean }> = {}
  for (const row of (data ?? []) as {
    lesson_id: string
    progress_percent?: number
    score?: number | null
    completed_at?: string | null
  }[]) {
    const percent = row.progress_percent ?? (row.completed_at ? 100 : 0)
    map[row.lesson_id] = {
      progress_percent: percent,
      score: row.score ?? null,
      completed: percent >= 100 || Boolean(row.completed_at),
    }
  }
  return map
}

export async function isEnrolled(client: SupabaseClient, userId: string, courseId: string): Promise<boolean> {
  const { data } = await client
    .from('enrollments')
    .select('course_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  return data !== null
}

export async function getMyCourses(client: SupabaseClient, userId: string): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Course[]
}

export interface EnrollmentSummary {
  course: Course
  progress: Progress
}

export async function getMyEnrollments(client: SupabaseClient, userId: string): Promise<EnrollmentSummary[]> {
  const { data: rows } = await client.from('enrollments').select('course_id').eq('user_id', userId)
  const courseIds = ((rows ?? []) as { course_id: string }[]).map(row => row.course_id)
  if (courseIds.length === 0) return []

  const [courses, lessons, done] = await Promise.all([
    client.from('courses').select('*').in('id', courseIds),
    client.from('lessons').select('id, course_id').in('course_id', courseIds),
    client.from('lesson_progress').select('lesson_id, progress_percent, completed_at').eq('user_id', userId),
  ])
  const lessonRows = (lessons.data ?? []) as { id: string; course_id: string }[]
  const progressRows = (done.data ?? []) as {
    lesson_id: string
    progress_percent?: number
    completed_at?: string | null
  }[]
  const progressMap: Record<string, number> = {}
  for (const p of progressRows) {
    progressMap[p.lesson_id] = p.progress_percent ?? (p.completed_at ? 100 : 0)
  }

  return ((courses.data ?? []) as Course[]).map(course => ({
    course,
    progress: computeProgress(
      lessonRows.filter(lesson => lesson.course_id === course.id).map(lesson => lesson.id),
      progressMap,
    ),
  }))
}

export async function isAdmin(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.rpc('is_admin')
  return data === true
}

export interface OpenReport {
  id: string
  reason: string
  created_at: string
  course: Pick<Course, 'id' | 'title' | 'slug' | 'status'> | null
}

interface ReportRow {
  id: string
  reason: string
  created_at: string
  courses: OpenReport['course'] | OpenReport['course'][]
}

export async function getOpenReports(client: SupabaseClient): Promise<OpenReport[]> {
  const { data } = await client
    .from('course_reports')
    .select('id, reason, created_at, courses(id, title, slug, status)')
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
  return ((data ?? []) as unknown as ReportRow[]).map(row => ({
    id: row.id,
    reason: row.reason,
    created_at: row.created_at,
    course: Array.isArray(row.courses) ? (row.courses[0] ?? null) : (row.courses ?? null),
  }))
}

export async function getSuspendedCourses(client: SupabaseClient): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('status', 'suspended')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Course[]
}

// ── Phase 2: Audio & Quiz Queries ──────────────────────────────────────────

/** Fetches questions and options for a lesson. Gated by RLS. */
export async function getQuizForLesson(client: SupabaseClient, lessonId: string): Promise<QuizQuestion[]> {
  const { data: questions } = await client
    .from('quiz_questions')
    .select('id, lesson_id, prompt, audio_path, position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true })

  if (!questions || questions.length === 0) return []

  const qIds = questions.map(q => q.id)
  const { data: options } = await client
    .from('quiz_options')
    .select('id, question_id, text, position')
    .in('question_id', qIds)
    .order('position', { ascending: true })

  const optionsMap = new Map<string, QuizOption[]>()
  for (const opt of (options ?? []) as QuizOption[]) {
    const list = optionsMap.get(opt.question_id) ?? []
    list.push(opt)
    optionsMap.set(opt.question_id, list)
  }

  return questions.map(q => ({
    ...q,
    options: optionsMap.get(q.id) ?? [],
  }))
}

/** Fetches quiz answer keys (allowed only for course owner / admin). */
export async function getTeacherQuizKeys(client: SupabaseClient, questionIds: string[]): Promise<Map<string, QuizAnswerKey>> {
  if (questionIds.length === 0) return new Map()
  const { data } = await client
    .from('quiz_answer_keys')
    .select('question_id, correct_option_ids, explanation')
    .in('question_id', questionIds)

  const map = new Map<string, QuizAnswerKey>()
  for (const key of (data ?? []) as QuizAnswerKey[]) {
    map.set(key.question_id, key)
  }
  return map
}

/** Retrieves the audio_path of a lesson content if present. */
export async function getLessonAudioPath(client: SupabaseClient, lessonId: string): Promise<string | null> {
  const { data } = await client
    .from('lesson_contents')
    .select('audio_path')
    .eq('lesson_id', lessonId)
    .maybeSingle()
  return data ? (data as { audio_path: string | null }).audio_path : null
}

/** Generates a short-lived signed URL (1 hour) for lesson audio playback. */
export async function getLessonAudioUrl(client: SupabaseClient, audioPath: string | null): Promise<string | null> {
  if (!audioPath) return null
  const { data, error } = await client.storage
    .from('lesson-audio')
    .createSignedUrl(audioPath, 3600)

  if (error || !data) return null
  return data.signedUrl
}

// ── Phase 3: Video Queries ──────────────────────────────────────────────────

/** Fetches ready or processing media asset for a lesson. */
export async function getMediaAssetForLesson(client: SupabaseClient, lessonId: string): Promise<MediaAsset | null> {
  console.log('[VideoView] 🎬 Resolving media asset for lesson:', lessonId)
  const { data, error } = await client
    .from('media_assets')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[VideoView] ❌ Database query error fetching media_assets:', error)
  }

  if (!data) {
    console.log('[VideoView] ℹ️ No media asset found in database for lesson:', lessonId)
    return null
  }
  let asset = data as MediaAsset
  console.log('[VideoView] 📦 Media asset retrieved from DB:', {
    assetId: asset.id,
    lessonId: asset.lesson_id,
    status: asset.status,
    muxPlaybackId: asset.mux_playback_id,
    muxAssetId: asset.mux_asset_id,
    durationSeconds: asset.duration_seconds,
    errorMessage: asset.error_message,
  })

  // Self-healing fallback: If asset is in 'uploading' or 'processing' state, sync directly with Mux API
  if ((asset.status === 'uploading' || asset.status === 'processing') && asset.mux_upload_id) {
    console.log('[VideoView] 🔄 Asset is in status', asset.status, '— syncing with Mux API...')
    asset = await syncMediaAssetWithMux(client, asset)
  }

  return asset
}

async function syncMediaAssetWithMux(client: SupabaseClient, asset: MediaAsset): Promise<MediaAsset> {
  const muxTokenId = process.env.MUX_TOKEN_ID
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET || process.env.MUX_SECRET_ID
  if (!muxTokenId || !muxTokenSecret || !asset.mux_upload_id) return asset

  try {
    const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`

    // 1. If asset_id is not known yet, query upload status from Mux
    let muxAssetId = asset.mux_asset_id
    if (!muxAssetId) {
      const uploadRes = await fetch(`https://api.mux.com/video/v1/uploads/${asset.mux_upload_id}`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      })
      if (uploadRes.ok) {
        const uploadJson = await uploadRes.json()
        muxAssetId = uploadJson.data?.asset_id ?? null
      }
    }

    if (!muxAssetId) return asset

    // 2. Query Mux Asset details directly
    const assetRes = await fetch(`https://api.mux.com/video/v1/assets/${muxAssetId}`, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    })

    if (!assetRes.ok) return asset
    const assetJson = await assetRes.json()
    const muxData = assetJson.data
    if (!muxData) return asset

    if (muxData.status === 'ready') {
      const playbackIds = (muxData.playback_ids ?? []) as { id: string; policy: string }[]
      const primaryPlayback = playbackIds.find(p => p.policy === 'signed') ?? playbackIds[0]
      const duration = Math.round(Number(muxData.duration ?? 0))

      if (primaryPlayback?.id) {
        const { data: updated } = await client
          .from('media_assets')
          .update({
            mux_asset_id: muxAssetId,
            mux_playback_id: primaryPlayback.id,
            duration_seconds: duration,
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', asset.id)
          .select('*')
          .single()

        if (updated) {
          console.log('[syncMediaAssetWithMux] 🎉 Synced asset state to READY:', asset.id)
          return updated as MediaAsset
        }
      }
    } else if (muxData.status === 'errored') {
      const { data: updated } = await client
        .from('media_assets')
        .update({
          mux_asset_id: muxAssetId,
          status: 'errored',
          error_message: muxData.errors?.messages?.[0] ?? 'Erreur Mux',
          updated_at: new Date().toISOString(),
        })
        .eq('id', asset.id)
        .select('*')
        .single()

      if (updated) return updated as MediaAsset
    } else if (muxAssetId !== asset.mux_asset_id) {
      await client
        .from('media_assets')
        .update({
          mux_asset_id: muxAssetId,
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', asset.id)
    }
  } catch (err) {
    console.error('[syncMediaAssetWithMux] Error syncing with Mux API:', err)
  }

  return asset
}

/** Fetches video quota and used minutes for a teacher. */
export async function getVideoQuota(client: SupabaseClient, userId: string): Promise<VideoQuota> {
  const { data } = await client.rpc('get_user_video_quota', { p_user_id: userId })
  if (data && data.length > 0) {
    return data[0] as VideoQuota
  }
  return { max_minutes: 30, used_seconds: 0, used_minutes: 0 }
}

/** Generates a short-lived (1 hour) signed Mux playback URL token for an asset. */
export async function getSignedMuxPlaybackToken(playbackId: string | null): Promise<string | null> {
  console.log('[VideoView] 🔑 Requesting signed Mux playback token for playbackId:', playbackId)
  if (!playbackId) {
    console.log('[VideoView] ⚠️ Skipping signed token: playbackId is null or empty.')
    return null
  }

  const keyId = process.env.MUX_SIGNING_KEY_ID
  const privateKey = process.env.MUX_PRIVATE_KEY || process.env.MUX_SIGNING_KEY_SECRET

  console.log('[VideoView] 🔐 Mux Signing Credentials Status:', {
    hasKeyId: Boolean(keyId),
    hasPrivateKey: Boolean(privateKey),
    keyIdLength: keyId?.length ?? 0,
    privateKeyLength: privateKey?.length ?? 0,
  })

  if (!keyId || !privateKey) {
    console.warn(
      '[VideoView] ⚠️ MUX_SIGNING_KEY_ID or MUX_PRIVATE_KEY is missing in environment! Signed playback token will not be generated (stream will rely on public playback policy).',
    )
    return null
  }

  try {
    const token = generateMuxPlaybackToken(playbackId, keyId, privateKey, 3600)
    console.log('[VideoView] ✅ Signed Mux playback token generated successfully (token length:', token.length, ')')
    return token
  } catch (err) {
    console.error('[VideoView] ❌ Exception generating Mux playback token:', err)
    return null
  }
}

// ── Phase 4: Assignment Queries ───────────────────────────────────────────

/** Fetches a learner's submission for a lesson. */
export async function getSubmissionForLesson(
  client: SupabaseClient,
  lessonId: string,
  userId: string,
): Promise<Submission | null> {
  const { data } = await client
    .from('submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('user_id', userId)
    .maybeSingle()

  return (data ?? null) as Submission | null
}

/** Fetches pending and reviewed submissions for courses owned by the teacher. */
export async function getPendingReviewsForTeacher(
  client: SupabaseClient,
  teacherUserId: string,
): Promise<PendingReviewItem[]> {
  // 1. Fetch courses owned by teacher
  const { data: courses } = await client.from('courses').select('id, title, slug').eq('owner_id', teacherUserId)
  if (!courses || courses.length === 0) return []

  const courseIds = courses.map(c => c.id)
  const courseMap = new Map(courses.map(c => [c.id, c]))

  // 2. Fetch lessons in those courses
  const { data: lessons } = await client.from('lessons').select('id, title, course_id').in('course_id', courseIds)
  if (!lessons || lessons.length === 0) return []

  const lessonIds = lessons.map(l => l.id)
  const lessonMap = new Map(lessons.map(l => [l.id, l]))

  // 3. Fetch submissions for those lessons
  const { data: submissions } = await client
    .from('submissions')
    .select('*')
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: false })

  if (!submissions || submissions.length === 0) return []

  // 4. Fetch learner profiles
  const userIds = Array.from(new Set(submissions.map(s => s.user_id)))
  const { data: profiles } = await client.from('profiles').select('id, full_name').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  return submissions.map(sub => {
    const lesson = lessonMap.get(sub.lesson_id)!
    const course = courseMap.get(lesson.course_id)!
    const profile = profileMap.get(sub.user_id)

    return {
      submission: sub as Submission,
      lesson,
      course,
      learner: {
        id: sub.user_id,
        email: null,
        full_name: profile?.full_name ?? 'Apprenant',
      },
    }
  })
}

// ── Phase 5: Payment Queries ──────────────────────────────────────────────

/** Fetches paid courses requesting admin approval for sale. */
export async function getPendingPaidCoursesForAdmin(client: SupabaseClient): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('access', 'paid')
    .eq('paid_approved', false)
    .order('created_at', { ascending: false })

  return (data ?? []) as Course[]
}

/** Fetches a user's course orders. */
export async function getUserOrders(client: SupabaseClient, userId: string): Promise<CourseOrder[]> {
  const { data } = await client
    .from('course_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data ?? []) as CourseOrder[]
}




