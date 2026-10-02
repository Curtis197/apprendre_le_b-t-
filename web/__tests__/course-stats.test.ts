import { describe, expect, it } from 'vitest'
import { summarizeCourseStats, type ProgressRow } from '../lib/courses/stats'

const lessons = [
  { id: 'l1', title: 'Salutations', kind: 'text' },
  { id: 'l2', title: 'Quiz', kind: 'quiz' },
]

const row = (over: Partial<ProgressRow>): ProgressRow => ({
  user_id: 'u1',
  full_name: 'Awa',
  enrolled_at: '2026-10-01T00:00:00Z',
  lesson_id: null,
  progress_percent: null,
  score: null,
  completed_at: null,
  ...over,
})

describe('summarizeCourseStats', () => {
  it('returns zeros, not NaN, with no learners', () => {
    expect(summarizeCourseStats([], lessons)).toEqual({
      enrolledCount: 0,
      averageProgress: 0,
      fullyCompletedCount: 0,
      learners: [],
      lessons: [
        { lessonId: 'l1', title: 'Salutations', kind: 'text', completedCount: 0, completionRate: 0, averageScore: null },
        { lessonId: 'l2', title: 'Quiz', kind: 'quiz', completedCount: 0, completionRate: 0, averageScore: null },
      ],
    })
  })

  it('handles a course with no lessons', () => {
    const stats = summarizeCourseStats([row({})], [])
    expect(stats.enrolledCount).toBe(1)
    expect(stats.learners[0].percent).toBe(0)
    expect(stats.averageProgress).toBe(0)
    expect(stats.lessons).toEqual([])
  })

  it('counts an enrolled learner with no progress', () => {
    const stats = summarizeCourseStats([row({})], lessons)
    expect(stats.enrolledCount).toBe(1)
    expect(stats.learners[0]).toMatchObject({ completedLessons: 0, percent: 0, averageScore: null })
  })

  it('aggregates partial progress, completion and scores per learner and per lesson', () => {
    const rows = [
      row({ user_id: 'u1', lesson_id: 'l1', progress_percent: 100, completed_at: '2026-10-02T00:00:00Z' }),
      row({ user_id: 'u1', lesson_id: 'l2', progress_percent: 100, score: 80, completed_at: '2026-10-02T00:00:00Z' }),
      row({ user_id: 'u2', full_name: 'Koffi', lesson_id: 'l1', progress_percent: 50 }),
      row({ user_id: 'u3', full_name: null }),
    ]
    const stats = summarizeCourseStats(rows, lessons)
    expect(stats.enrolledCount).toBe(3)
    expect(stats.fullyCompletedCount).toBe(1)

    const byId = Object.fromEntries(stats.learners.map(l => [l.userId, l]))
    expect(byId.u1).toMatchObject({ completedLessons: 2, percent: 100, averageScore: 80 })
    expect(byId.u2).toMatchObject({ completedLessons: 0, percent: 25 })
    expect(byId.u3.name).toBe('Apprenant')
    expect(stats.averageProgress).toBe(42) // (100 + 25 + 0) / 3

    const l1 = stats.lessons.find(l => l.lessonId === 'l1')!
    expect(l1).toMatchObject({ completedCount: 1, completionRate: 33, averageScore: null })
    const l2 = stats.lessons.find(l => l.lessonId === 'l2')!
    expect(l2).toMatchObject({ completedCount: 1, completionRate: 33, averageScore: 80 })
  })

  it('sorts learners who need attention first (lowest progress)', () => {
    const rows = [
      row({ user_id: 'a', full_name: 'A', lesson_id: 'l1', progress_percent: 100, completed_at: 'x' }),
      row({ user_id: 'b', full_name: 'B' }),
    ]
    expect(summarizeCourseStats(rows, lessons).learners.map(l => l.userId)).toEqual(['b', 'a'])
  })

  it('ignores progress rows for lessons that are no longer in the course', () => {
    const rows = [row({ lesson_id: 'deleted', progress_percent: 100, completed_at: 'x' })]
    expect(summarizeCourseStats(rows, lessons).learners[0].percent).toBe(0)
  })

  it('accepts numerics serialised as strings', () => {
    const rows = [row({ lesson_id: 'l2', progress_percent: '100', score: '72.5', completed_at: 'x' })]
    const stats = summarizeCourseStats(rows, lessons)
    expect(stats.learners[0].averageScore).toBe(73)
  })
})
