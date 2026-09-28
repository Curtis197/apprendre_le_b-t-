import type { DialectKey } from '../dialect'

export type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'
export type CourseAccess = 'free' | 'paid'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type LessonKind = 'text' | 'audio' | 'video' | 'quiz' | 'assignment' | 'fill_in_blank'

export interface Course {
  id: string
  owner_id: string
  title: string
  slug: string
  summary: string
  cover_url: string | null
  dialect: DialectKey
  level: CourseLevel
  status: CourseStatus
  access: CourseAccess
  price_cents: number | null
  currency: string | null
  paid_approved?: boolean
  created_at: string
  updated_at: string
}

export interface Section {
  id: string
  course_id: string
  title: string
  position: number
}

export interface Lesson {
  id: string
  section_id: string
  course_id: string
  title: string
  position: number
  kind: LessonKind
  is_preview: boolean
}

export interface OutlineSection extends Section {
  lessons: Lesson[]
}

export interface CourseInput {
  title: string
  summary: string
  dialect: DialectKey
  level: CourseLevel
  access?: CourseAccess
  price_cents?: number | null
  currency?: string | null
}

export type Result<T> = { data: T; error: null } | { data: null; error: string }
