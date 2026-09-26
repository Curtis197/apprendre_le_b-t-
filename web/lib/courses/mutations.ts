// lib/courses/mutations.ts — client-side writes for the course platform.
// Authorization is enforced by RLS; these helpers add validation and friendly
// French errors. Pass a client created with createClient() from supabase-browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSlug } from './slug'
import type { CourseInput, Result } from './types'

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
  patch: { title?: string; is_preview?: boolean },
): Promise<Result<null>> {
  const update: { title?: string; is_preview?: boolean } = {}
  if (patch.title !== undefined) {
    const clean = patch.title.trim()
    if (!clean) return fail('Le titre est obligatoire.')
    update.title = clean
  }
  if (patch.is_preview !== undefined) update.is_preview = patch.is_preview
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

export async function setLessonCompleted(
  client: SupabaseClient,
  lessonId: string,
  completed: boolean,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour suivre votre progression.')
  if (completed) {
    const { error } = await client.from('lesson_progress').insert({ user_id: user.id, lesson_id: lessonId })
    if (error && error.code !== PG_UNIQUE_VIOLATION) return fail(error.message)
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
