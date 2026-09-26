import 'server-only'
// lib/courses/queries.ts — server-side reads for the course platform.
// Visibility is decided by RLS: an anonymous client sees published courses,
// a signed-in client additionally sees its own, enrolled and (admins) all courses.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DialectKey } from '../dialect'
import { buildOutline, computeProgress, type Progress } from './outline'
import type { Course, CourseLevel, Lesson, OutlineSection, Section } from './types'

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
    .select('lesson_id')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds)
  return ((data ?? []) as { lesson_id: string }[]).map(row => row.lesson_id)
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
    client.from('lesson_progress').select('lesson_id').eq('user_id', userId),
  ])
  const lessonRows = (lessons.data ?? []) as { id: string; course_id: string }[]
  const doneIds = ((done.data ?? []) as { lesson_id: string }[]).map(row => row.lesson_id)

  return ((courses.data ?? []) as Course[]).map(course => ({
    course,
    progress: computeProgress(
      lessonRows.filter(lesson => lesson.course_id === course.id).map(lesson => lesson.id),
      doneIds,
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
