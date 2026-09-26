import { describe, expect, it } from 'vitest'
import {
  buildOutline,
  computeProgress,
  flattenLessons,
  nextLessonId,
  publishBlocker,
  resumeLessonId,
} from '../lib/courses/outline'
import type { Lesson, Section } from '../lib/courses/types'

const section = (id: string, position: number): Section => ({
  id,
  course_id: 'c1',
  title: `Section ${id}`,
  position,
})

const lesson = (id: string, sectionId: string, position: number): Lesson => ({
  id,
  section_id: sectionId,
  course_id: 'c1',
  title: `Leçon ${id}`,
  position,
  kind: 'text',
  is_preview: false,
})

const outline = buildOutline(
  [section('s2', 1), section('s1', 0)],
  [lesson('b', 's1', 1), lesson('a', 's1', 0), lesson('c', 's2', 0)],
)
const flat = flattenLessons(outline)

describe('buildOutline', () => {
  it('orders sections and lessons by position and groups lessons by section', () => {
    expect(outline.map(s => s.id)).toEqual(['s1', 's2'])
    expect(outline[0].lessons.map(l => l.id)).toEqual(['a', 'b'])
    expect(outline[1].lessons.map(l => l.id)).toEqual(['c'])
  })

  it('gives sections without lessons an empty list', () => {
    expect(buildOutline([section('s1', 0)], [])[0].lessons).toEqual([])
  })
})

describe('flattenLessons', () => {
  it('returns lessons in reading order', () => {
    expect(flat.map(l => l.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('computeProgress', () => {
  it('counts completed lessons and rounds the percentage', () => {
    expect(computeProgress(['a', 'b', 'c'], ['a'])).toEqual({ completed: 1, total: 3, percent: 33 })
  })

  it('returns zero for a course without lessons', () => {
    expect(computeProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 })
  })

  it('ignores completed ids that do not belong to the course', () => {
    expect(computeProgress(['a'], ['a', 'zzz'])).toEqual({ completed: 1, total: 1, percent: 100 })
  })
})

describe('nextLessonId', () => {
  it('returns the following lesson, or null at the end or for an unknown id', () => {
    expect(nextLessonId(flat, 'a')).toBe('b')
    expect(nextLessonId(flat, 'c')).toBeNull()
    expect(nextLessonId(flat, 'zzz')).toBeNull()
  })
})

describe('resumeLessonId', () => {
  it('returns the first unfinished lesson', () => {
    expect(resumeLessonId(flat, ['a'])).toBe('b')
  })

  it('returns the first lesson when nothing is done or everything is done', () => {
    expect(resumeLessonId(flat, [])).toBe('a')
    expect(resumeLessonId(flat, ['a', 'b', 'c'])).toBe('a')
  })

  it('returns null when there are no lessons', () => {
    expect(resumeLessonId([], [])).toBeNull()
  })
})

describe('publishBlocker', () => {
  it('blocks publishing a course with no lessons', () => {
    expect(publishBlocker([])).toMatch(/au moins une leçon/)
    expect(publishBlocker(buildOutline([section('s1', 0)], []))).toMatch(/au moins une leçon/)
  })

  it('allows publishing once a lesson exists', () => {
    expect(publishBlocker(outline)).toBeNull()
  })
})
