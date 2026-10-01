// lib/courses/mutations.ts — client-side writes for the course platform.
// Authorization is enforced by RLS; these helpers add validation and friendly
// French errors. Pass a client created with createClient() from supabase-browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidAudioFile } from './audio'
import type { QuizInput, QuizSubmissionResult } from './quiz'
import { buildSlug } from './slug'
import type { CourseInput, LessonKind, Result } from './types'
import type { Submission } from './assignment'
import type { CourseOrder, PaymentRail } from './payment'

async function checkAdmin(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.rpc('is_admin')
  return data === true
}

const PG_UNIQUE_VIOLATION = '23505'

function ok<T>(data: T): Result<T> {
  return { data, error: null }
}

function fail(error: string): Result<never> {
  return { data: null, error }
}

function done(error: { message: string } | null): Result<null> {
  return error ? fail(error.message) : ok(null)
}

async function getAuthUser(client: SupabaseClient) {
  const {
    data: { user },
  } = await client.auth.getUser()
  return user
}

const TITLE_ERROR = 'Le titre doit contenir entre 3 et 120 caractères.'

// ── Courses ────────────────────────────────────────────────────────────────

/** Creates a draft course owned by the current user. Retries with a fresh slug on collision. */
export async function createCourse(
  client: SupabaseClient,
  input: CourseInput,
  random: () => number = Math.random,
): Promise<Result<{ id: string; slug: string }>> {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) return fail(TITLE_ERROR)

  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour créer un cours.')

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await client
      .from('courses')
      .insert({
        owner_id: user.id,
        title,
        slug: buildSlug(title, random),
        summary: input.summary.trim(),
        dialect: input.dialect,
        level: input.level,
      })
      .select('id, slug')
      .single()
    if (!error && data) {
      const row = data as { id: string; slug: string }
      return ok({ id: row.id, slug: row.slug })
    }
    if (error?.code !== PG_UNIQUE_VIOLATION) return fail(error?.message ?? 'Erreur inattendue.')
  }
  return fail('Impossible de générer une adresse unique, réessayez.')
}

export async function updateCourse(
  client: SupabaseClient,
  courseId: string,
  input: CourseInput,
): Promise<Result<null>> {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) return fail(TITLE_ERROR)
  const { error } = await client
    .from('courses')
    .update({
      title,
      summary: input.summary.trim(),
      dialect: input.dialect,
      level: input.level,
    })
    .eq('id', courseId)
  return done(error)
}

export async function setCourseStatus(
  client: SupabaseClient,
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status }).eq('id', courseId)
  return done(error)
}

export async function deleteCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').delete().eq('id', courseId)
  return done(error)
}

// ── Sections and lessons ───────────────────────────────────────────────────

export async function addSection(
  client: SupabaseClient,
  courseId: string,
  title: string,
  position: number,
): Promise<Result<{ id: string }>> {
  const clean = title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { data, error } = await client
    .from('course_sections')
    .insert({ course_id: courseId, title: clean, position })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Erreur inattendue.')
  return ok({ id: (data as { id: string }).id })
}

export async function renameSection(
  client: SupabaseClient,
  sectionId: string,
  title: string,
): Promise<Result<null>> {
  const clean = title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { error } = await client.from('course_sections').update({ title: clean }).eq('id', sectionId)
  return done(error)
}

export async function deleteSection(client: SupabaseClient, sectionId: string): Promise<Result<null>> {
  const { error } = await client.from('course_sections').delete().eq('id', sectionId)
  return done(error)
}

export async function addLesson(
  client: SupabaseClient,
  input: { courseId: string; sectionId: string; title: string; position: number },
): Promise<Result<{ id: string }>> {
  const clean = input.title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { data, error } = await client
    .from('lessons')
    .insert({
      course_id: input.courseId,
      section_id: input.sectionId,
      title: clean,
      position: input.position,
      kind: 'text',
    })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Erreur inattendue.')
  return ok({ id: (data as { id: string }).id })
}

export async function updateLesson(
  client: SupabaseClient,
  lessonId: string,
  patch: { title?: string; is_preview?: boolean; kind?: LessonKind },
): Promise<Result<null>> {
  const update: { title?: string; is_preview?: boolean; kind?: LessonKind } = {}
  if (patch.title !== undefined) {
    const clean = patch.title.trim()
    if (!clean) return fail('Le titre est obligatoire.')
    update.title = clean
  }
  if (patch.is_preview !== undefined) update.is_preview = patch.is_preview
  if (patch.kind !== undefined) update.kind = patch.kind
  const { error } = await client.from('lessons').update(update).eq('id', lessonId)
  return done(error)
}

export async function deleteLesson(client: SupabaseClient, lessonId: string): Promise<Result<null>> {
  const { error } = await client.from('lessons').delete().eq('id', lessonId)
  return done(error)
}

export async function saveLessonContent(
  client: SupabaseClient,
  lessonId: string,
  body: string,
): Promise<Result<null>> {
  if (body.length > 50000) return fail('Le texte est trop long (50 000 caractères maximum).')
  const { error } = await client.from('lesson_contents').update({ body_md: body }).eq('lesson_id', lessonId)
  return done(error)
}

export async function applyPositions(
  client: SupabaseClient,
  table: 'course_sections' | 'lessons',
  changes: { id: string; position: number }[],
): Promise<Result<null>> {
  const results = await Promise.all(
    changes.map(change => client.from(table).update({ position: change.position }).eq('id', change.id)),
  )
  const failed = results.find(r => r.error)
  return done(failed?.error ?? null)
}

// ── Learner actions ────────────────────────────────────────────────────────

export async function enroll(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour vous inscrire.')
  const { error } = await client.from('enrollments').insert({ user_id: user.id, course_id: courseId })
  if (error && error.code !== PG_UNIQUE_VIOLATION) return fail(error.message)
  return ok(null)
}

export interface LessonProgressInput {
  progressPercent?: number
  score?: number | null
  completed?: boolean
}

export async function saveLessonProgress(
  client: SupabaseClient,
  lessonId: string,
  input: LessonProgressInput,
): Promise<Result<{ progress_percent: number; score: number | null; completed: boolean }>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour suivre votre progression.')

  // Progress only moves forward: replaying a finished lesson, or retrying an
  // exercise with a worse result, must not undo completion or lower the best score.
  const { data: existing } = await client
    .from('lesson_progress')
    .select('progress_percent, score, completed_at')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  const requested = Math.min(100, Math.max(0, Math.round(input.progressPercent ?? (input.completed ? 100 : 0))))
  const percent = Math.max(requested, Math.round(Number(existing?.progress_percent ?? 0)))
  const isCompleted = Boolean(existing?.completed_at) || (input.completed ?? percent >= 100)
  const completedAt = isCompleted ? (existing?.completed_at ?? new Date().toISOString()) : null

  const payload: {
    user_id: string
    lesson_id: string
    progress_percent: number
    completed_at: string | null
    score?: number | null
  } = {
    user_id: user.id,
    lesson_id: lessonId,
    progress_percent: percent,
    completed_at: completedAt,
  }

  let score: number | null = existing?.score ?? null
  if (input.score !== undefined && input.score !== null) {
    score = Math.max(input.score, score ?? 0)
    payload.score = score
  } else if (input.score === null) {
    payload.score = null
    score = null
  }

  const { error } = await client.from('lesson_progress').upsert(payload, { onConflict: 'user_id,lesson_id' })
  if (error) return fail(error.message)
  return ok({ progress_percent: percent, score, completed: isCompleted })
}

export async function setLessonCompleted(
  client: SupabaseClient,
  lessonId: string,
  completed: boolean,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour suivre votre progression.')
  if (completed) {
    const res = await saveLessonProgress(client, lessonId, { completed: true, progressPercent: 100 })
    if (res.error) return fail(res.error)
    return ok(null)
  }
  const { error } = await client
    .from('lesson_progress')
    .delete()
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
  return done(error)
}

export async function reportCourse(
  client: SupabaseClient,
  courseId: string,
  reason: string,
): Promise<Result<null>> {
  const clean = reason.trim()
  if (clean.length < 5) return fail('Précisez le motif (5 caractères minimum).')
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour signaler un cours.')
  const { error } = await client
    .from('course_reports')
    .insert({ course_id: courseId, reporter_id: user.id, reason: clean })
  if (error?.code === PG_UNIQUE_VIOLATION) return fail('Vous avez déjà signalé ce cours.')
  return done(error)
}

// ── Moderation (admin only, enforced by RLS) ───────────────────────────────

export async function resolveReport(client: SupabaseClient, reportId: string): Promise<Result<null>> {
  const { error } = await client
    .from('course_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  return done(error)
}

export async function suspendCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status: 'suspended' }).eq('id', courseId)
  if (error) return fail(error.message)
  const { error: reportError } = await client
    .from('course_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('course_id', courseId)
    .is('resolved_at', null)
  return done(reportError)
}

export async function restoreCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status: 'draft' }).eq('id', courseId)
  return done(error)
}

// ── Phase 2: Audio & Quiz Mutations ────────────────────────────────────────

/** Uploads an audio clip to the lesson-audio bucket and updates lesson_contents. */
export async function uploadLessonAudio(
  client: SupabaseClient,
  courseOwnerId: string,
  lessonId: string,
  file: File,
): Promise<Result<{ audioPath: string }>> {
  const check = isValidAudioFile(file)
  if (!check.valid) return fail(check.error ?? 'Fichier audio invalide.')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp3'
  const path = `${courseOwnerId}/${lessonId}/audio_${Date.now()}.${ext}`

  const { error: uploadError } = await client.storage
    .from('lesson-audio')
    .upload(path, file, { upsert: true })

  if (uploadError) return fail(uploadError.message)

  const { error: dbError } = await client
    .from('lesson_contents')
    .update({ audio_path: path })
    .eq('lesson_id', lessonId)

  if (dbError) return fail(dbError.message)
  return ok({ audioPath: path })
}

/** Deletes an audio clip from storage and clears audio_path in lesson_contents. */
export async function deleteLessonAudio(
  client: SupabaseClient,
  lessonId: string,
  audioPath: string,
): Promise<Result<null>> {
  await client.storage.from('lesson-audio').remove([audioPath])
  const { error } = await client
    .from('lesson_contents')
    .update({ audio_path: null })
    .eq('lesson_id', lessonId)

  return done(error)
}

/** Saves all quiz questions, options, and secret answer keys for a lesson. */
export async function saveQuiz(
  client: SupabaseClient,
  lessonId: string,
  input: QuizInput,
): Promise<Result<null>> {
  // 1. Delete existing questions (cascades to options and keys)
  const { error: delError } = await client.from('quiz_questions').delete().eq('lesson_id', lessonId)
  if (delError) return fail(delError.message)

  // 2. Insert questions, options, and keys
  for (let qIndex = 0; qIndex < input.questions.length; qIndex++) {
    const qData = input.questions[qIndex]
    const { data: qRow, error: qError } = await client
      .from('quiz_questions')
      .insert({
        lesson_id: lessonId,
        prompt: qData.prompt.trim(),
        audio_path: qData.audio_path ?? null,
        position: qIndex,
      })
      .select('id')
      .single()

    if (qError || !qRow) return fail(qError?.message ?? 'Erreur lors de la création de la question.')

    const optionsToInsert = qData.options.map((opt, optIndex) => ({
      question_id: qRow.id,
      text: opt.text.trim(),
      position: optIndex,
    }))

    const { data: optRows, error: optError } = await client
      .from('quiz_options')
      .insert(optionsToInsert)
      .select('id, position')

    if (optError || !optRows) return fail(optError?.message ?? 'Erreur lors de la création des options.')

    // Map correct indices to inserted option UUIDs
    const correctIds = qData.correctOptionIndices
      .map(idx => optRows.find(r => r.position === idx)?.id)
      .filter((id): id is string => Boolean(id))

    const { error: keyError } = await client.from('quiz_answer_keys').insert({
      question_id: qRow.id,
      correct_option_ids: correctIds,
      explanation: qData.explanation.trim(),
    })

    if (keyError) return fail(keyError.message)
  }

  return ok(null)
}

/** Submits learner answers for server-side evaluation. */
export async function submitQuizAnswers(
  client: SupabaseClient,
  lessonId: string,
  answers: Record<string, string[]>,
): Promise<Result<QuizSubmissionResult>> {
  const { data, error } = await client.rpc('submit_quiz', {
    p_lesson_id: lessonId,
    p_answers: answers,
  })

  if (error || !data) return fail(error?.message ?? 'Erreur lors de l’évaluation du quiz.')
  return ok(data as QuizSubmissionResult)
}

// ── Phase 3: Video Mutations ───────────────────────────────────────────────

/** Deletes a media asset from database and Mux API. */
export async function deleteMediaAsset(
  client: SupabaseClient,
  assetId: string,
  muxAssetId: string | null,
): Promise<Result<null>> {
  if (muxAssetId) {
    const muxTokenId = process.env.MUX_TOKEN_ID
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET || process.env.MUX_SECRET_ID
    if (muxTokenId && muxTokenSecret) {
      const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`
      await fetch(`https://api.mux.com/video/v1/assets/${muxAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      }).catch(() => null)
    }
  }

  const { error } = await client.from('media_assets').delete().eq('id', assetId)
  return done(error)
}

// ── Phase 4: Assignment Mutations ─────────────────────────────────────────

/** Submits an assignment (text or audio) and marks lesson complete automatically. */
export async function submitAssignment(
  client: SupabaseClient,
  lessonId: string,
  answerText: string | null,
  audioPath: string | null,
): Promise<Result<Submission>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour remettre un devoir.')

  if (!answerText?.trim() && !audioPath) {
    return fail('Veuillez fournir une réponse écrite ou un enregistrement audio.')
  }

  const { data, error } = await client
    .from('submissions')
    .upsert(
      {
        lesson_id: lessonId,
        user_id: user.id,
        answer_text: answerText?.trim() || null,
        audio_path: audioPath || null,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single()

  if (error || !data) return fail(error?.message ?? 'Erreur lors de la remise du devoir.')

  // Mark lesson as complete in lesson_progress so learner is never blocked by teacher review queue
  const progress = await saveLessonProgress(client, lessonId, { completed: true, progressPercent: 100 })
  if (progress.error) return fail(progress.error)

  return ok(data as Submission)
}

/** Teacher submits review feedback and optional grade for a submission. */
export async function reviewSubmission(
  client: SupabaseClient,
  submissionId: string,
  feedback: string,
  grade: number | null,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour corriger ce devoir.')

  if (!feedback.trim()) return fail('Veuillez saisir un commentaire de correction.')

  const { error: updateError } = await client
    .from('submissions')
    .update({
      status: 'reviewed',
      teacher_feedback: feedback.trim(),
      grade: grade !== null && grade !== undefined ? Math.min(100, Math.max(0, grade)) : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (updateError) return fail(updateError.message)

  // The email needs the service-role key and the Resend key, so a server route
  // sends it. Fire-and-forget: a failed notification must not fail the review.
  void fetch('/api/courses/submissions/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId }),
  }).catch(() => null)

  return ok(null)
}

// ── Phase 5: Payment Mutations ───────────────────────────────────────────

/** Creates a pending course order for a paid course. */
export async function createPendingCourseOrder(
  client: SupabaseClient,
  courseId: string,
  paymentRail: PaymentRail,
): Promise<Result<CourseOrder>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour acheter ce cours.')

  const { data: course } = await client
    .from('courses')
    .select('id, access, price_cents, currency, paid_approved')
    .eq('id', courseId)
    .single()

  if (!course) return fail('Cours introuvable.')
  if (course.access !== 'paid' || !course.paid_approved) return fail('Ce cours n’est pas disponible à l’achat.')
  if (!course.price_cents || course.price_cents <= 0) return fail('Le prix du cours est invalide.')

  const { data: order, error } = await client
    .from('course_orders')
    .insert({
      user_id: user.id,
      course_id: course.id,
      amount_cents: course.price_cents,
      currency: course.currency || 'eur',
      payment_rail: paymentRail,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error || !order) return fail(error?.message ?? 'Erreur lors de la création de la commande.')

  return ok(order as CourseOrder)
}

/** Admin toggles paid course sale approval. */
export async function approvePaidCourse(
  client: SupabaseClient,
  courseId: string,
  approved: boolean,
): Promise<Result<null>> {
  const admin = await checkAdmin(client)
  if (!admin) return fail('Action réservée aux administrateurs.')

  const { error } = await client.from('courses').update({ paid_approved: approved }).eq('id', courseId)
  return done(error)
}




