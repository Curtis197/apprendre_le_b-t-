import type { Lesson, OutlineSection, Section } from './types'

export function buildOutline(sections: Section[], lessons: Lesson[]): OutlineSection[] {
  const bySection = new Map<string, Lesson[]>()
  for (const lesson of [...lessons].sort((a, b) => a.position - b.position)) {
    const list = bySection.get(lesson.section_id) ?? []
    list.push(lesson)
    bySection.set(lesson.section_id, list)
  }
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map(section => ({ ...section, lessons: bySection.get(section.id) ?? [] }))
}

export function flattenLessons(outline: OutlineSection[]): Lesson[] {
  return outline.flatMap(section => section.lessons)
}

export interface Progress {
  completed: number
  total: number
  percent: number
}

export type ProgressSource =
  | Iterable<string>
  | Map<string, number>
  | Record<string, number | { progress_percent?: number; completed_at?: string | null }>

function getLessonPercentAndDone(
  source: ProgressSource,
  lessonId: string,
): { percent: number; done: boolean } {
  if (source instanceof Map) {
    const val = source.get(lessonId) ?? 0
    const percent = Math.max(0, Math.min(100, Math.round(val)))
    return { percent, done: percent >= 100 }
  }

  // Check if it's an iterable of strings (e.g. Set, Array of strings)
  if (typeof source === 'object' && source !== null && Symbol.iterator in source) {
    const done = new Set(source as Iterable<string>).has(lessonId)
    return { percent: done ? 100 : 0, done }
  }

  if (typeof source === 'object' && source !== null) {
    const item = (source as Record<string, number | { progress_percent?: number; completed_at?: string | null }>)[lessonId]
    if (typeof item === 'number') {
      const percent = Math.max(0, Math.min(100, Math.round(item)))
      return { percent, done: percent >= 100 }
    }
    if (typeof item === 'object' && item !== null) {
      const p = item.progress_percent ?? (item.completed_at ? 100 : 0)
      const percent = Math.max(0, Math.min(100, Math.round(p)))
      const done = Boolean(item.completed_at) || percent >= 100
      return { percent, done }
    }
  }

  return { percent: 0, done: false }
}

export function computeProgress(lessonIds: string[], progressSource: ProgressSource): Progress {
  const total = lessonIds.length
  if (total === 0) return { completed: 0, total: 0, percent: 0 }

  let totalPercentSum = 0
  let completed = 0

  for (const id of lessonIds) {
    const { percent, done } = getLessonPercentAndDone(progressSource, id)
    totalPercentSum += percent
    if (done) completed++
  }

  return {
    completed,
    total,
    percent: Math.round(totalPercentSum / total),
  }
}

export function nextLessonId(flat: Lesson[], currentId: string): string | null {
  const index = flat.findIndex(lesson => lesson.id === currentId)
  if (index === -1 || index === flat.length - 1) return null
  return flat[index + 1].id
}

/** First unfinished lesson; the first lesson when nothing (or everything) is done; null with no lessons. */
export function resumeLessonId(flat: Lesson[], progressSource: ProgressSource): string | null {
  if (flat.length === 0) return null
  return (flat.find(lesson => !getLessonPercentAndDone(progressSource, lesson.id).done) ?? flat[0]).id
}

/** A French message explaining why the course cannot be published yet, or null when it can. */
export function publishBlocker(outline: OutlineSection[]): string | null {
  if (flattenLessons(outline).length === 0) return 'Ajoutez au moins une leçon avant de publier.'
  return null
}
