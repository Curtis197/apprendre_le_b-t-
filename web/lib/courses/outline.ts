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

export function computeProgress(lessonIds: string[], completedIds: Iterable<string>): Progress {
  const done = new Set(completedIds)
  const total = lessonIds.length
  const completed = lessonIds.filter(id => done.has(id)).length
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

export function nextLessonId(flat: Lesson[], currentId: string): string | null {
  const index = flat.findIndex(lesson => lesson.id === currentId)
  if (index === -1 || index === flat.length - 1) return null
  return flat[index + 1].id
}

/** First unfinished lesson; the first lesson when nothing (or everything) is done; null with no lessons. */
export function resumeLessonId(flat: Lesson[], completedIds: Iterable<string>): string | null {
  if (flat.length === 0) return null
  const done = new Set(completedIds)
  return (flat.find(lesson => !done.has(lesson.id)) ?? flat[0]).id
}

/** A French message explaining why the course cannot be published yet, or null when it can. */
export function publishBlocker(outline: OutlineSection[]): string | null {
  if (flattenLessons(outline).length === 0) return 'Ajoutez au moins une leçon avant de publier.'
  return null
}
