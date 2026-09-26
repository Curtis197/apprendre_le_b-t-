import { DIALECT_KEYS, type DialectKey } from '../dialect'
import type { CourseLevel, CourseStatus, LessonKind } from './types'

export const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
}

export const STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
  suspended: 'Suspendu',
}

// Only Tailwind opacity utilities that have an iOS <16.2 fallback in globals.css.
export const STATUS_STYLES: Record<CourseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-secondary/10 text-secondary',
  archived: 'bg-muted text-muted-foreground',
  suspended: 'bg-destructive/10 text-destructive',
}

export const KIND_LABELS: Record<LessonKind, string> = {
  text: 'Texte',
  audio: 'Audio',
  video: 'Vidéo',
  quiz: 'QCM',
  assignment: 'Exercice',
}

export function isDialect(value: unknown): value is DialectKey {
  return typeof value === 'string' && (DIALECT_KEYS as string[]).includes(value)
}

export function isLevel(value: unknown): value is CourseLevel {
  return typeof value === 'string' && (LEVELS as string[]).includes(value)
}
