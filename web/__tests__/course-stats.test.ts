import { describe, expect, it } from 'vitest'
import {
  INACTIVE_AFTER_DAYS,
  filterLearners,
  summarizeCourseStats,
  type ProgressRow,
} from '../lib/courses/stats'

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
  last_activity_at: null,
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
        { lessonId: 'l1', title: 'Salutations', kind: 'text', completedCount: 0, completionRate: 0, averageScore: null, dropOffFromPrevious: null },
        { lessonId: 'l2', title: 'Quiz', kind: 'quiz', completedCount: 0, completionRate: 0, averageScore: null, dropOffFromPrevious: 0 },
      ],
      biggestDropLessonId: null,
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

const NOW = new Date('2026-10-20T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('learner status and last activity', () => {
  const statusOf = (rows: ProgressRow[]) => summarizeCourseStats(rows, lessons, NOW).learners[0]

  it('is not_started without any lesson progress, with no last activity', () => {
    expect(statusOf([row({})])).toMatchObject({ status: 'not_started', lastActivityAt: null })
  })

  it('is active when the latest activity is recent', () => {
    const l = statusOf([row({ lesson_id: 'l1', progress_percent: 40, last_activity_at: daysAgo(2) })])
    expect(l).toMatchObject({ status: 'active', lastActivityAt: daysAgo(2) })
  })

  it('is inactive once the latest activity is older than the threshold', () => {
    const l = statusOf([row({ lesson_id: 'l1', progress_percent: 40, last_activity_at: daysAgo(INACTIVE_AFTER_DAYS + 1) })])
    expect(l.status).toBe('inactive')
  })

  it('takes the most recent activity across lessons', () => {
    const l = statusOf([
      row({ lesson_id: 'l1', progress_percent: 100, last_activity_at: daysAgo(30) }),
      row({ lesson_id: 'l2', progress_percent: 10, last_activity_at: daysAgo(1) }),
    ])
    expect(l).toMatchObject({ status: 'active', lastActivityAt: daysAgo(1) })
  })

  it('falls back to completed_at when last_activity_at is missing', () => {
    const l = statusOf([row({ lesson_id: 'l1', progress_percent: 50, completed_at: daysAgo(3) })])
    expect(l).toMatchObject({ status: 'active', lastActivityAt: daysAgo(3) })
  })

  it('is completed when every lesson is done, even if old', () => {
    const l = statusOf([
      row({ lesson_id: 'l1', progress_percent: 100, last_activity_at: daysAgo(90) }),
      row({ lesson_id: 'l2', progress_percent: 100, last_activity_at: daysAgo(90) }),
    ])
    expect(l.status).toBe('completed')
  })

  it('exposes a lesson-by-lesson breakdown in course order, including untouched lessons', () => {
    const l = statusOf([row({ lesson_id: 'l2', progress_percent: 100, score: 90, last_activity_at: daysAgo(1) })])
    expect(l.lessons).toEqual([
      { lessonId: 'l1', title: 'Salutations', kind: 'text', percent: 0, score: null, done: false, at: null },
      { lessonId: 'l2', title: 'Quiz', kind: 'quiz', percent: 100, score: 90, done: true, at: daysAgo(1) },
    ])
  })
})

describe('drop-off funnel', () => {
  const three = [...lessons, { id: 'l3', title: 'Dialogue', kind: 'audio' }]
  const done = (user: string, lesson: string) =>
    row({ user_id: user, lesson_id: lesson, progress_percent: 100, completed_at: daysAgo(1) })

  it('reports the drop in completion rate versus the previous lesson and flags the biggest', () => {
    const rows = [
      done('a', 'l1'), done('a', 'l2'), done('a', 'l3'),
      done('b', 'l1'), done('b', 'l2'),
      done('c', 'l1'),
      row({ user_id: 'd', full_name: 'D' }),
    ]
    const stats = summarizeCourseStats(rows, three, NOW)
    expect(stats.lessons.map(l => l.dropOffFromPrevious)).toEqual([null, 25, 25])
    // tie: the earliest lesson with the max drop wins
    expect(stats.biggestDropLessonId).toBe('l2')
  })

  it('flags nothing when nobody drops', () => {
    const stats = summarizeCourseStats([done('a', 'l1'), done('a', 'l2')], lessons, NOW)
    expect(stats.biggestDropLessonId).toBeNull()
  })

  it('clamps negative drops (a later lesson completed more often) to zero', () => {
    const stats = summarizeCourseStats([done('a', 'l2'), done('b', 'l2'), done('a', 'l1')], lessons, NOW)
    expect(stats.lessons[1].dropOffFromPrevious).toBe(0)
  })
})

describe('filterLearners', () => {
  const rows = [
    row({ user_id: 'a', full_name: 'Awa', lesson_id: 'l1', progress_percent: 100, last_activity_at: daysAgo(1) }),
    row({ user_id: 'b', full_name: 'Bintou', lesson_id: 'l1', progress_percent: 20, last_activity_at: daysAgo(40) }),
    row({ user_id: 'c', full_name: 'Cheick' }),
  ]
  const learners = summarizeCourseStats(rows, lessons, NOW).learners

  it('filters by status and keeps everyone for "all"', () => {
    expect(filterLearners(learners, 'all', 'progress').map(l => l.userId).sort()).toEqual(['a', 'b', 'c'])
    expect(filterLearners(learners, 'inactive', 'progress').map(l => l.userId)).toEqual(['b'])
  })

  it('sorts by least recent activity first, never-active learners first of all', () => {
    expect(filterLearners(learners, 'all', 'activity').map(l => l.userId)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by lowest progress first', () => {
    expect(filterLearners(learners, 'all', 'progress').map(l => l.userId)).toEqual(['c', 'b', 'a'])
  })
})
