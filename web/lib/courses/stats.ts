export interface ProgressRow {
  user_id: string
  full_name: string | null
  enrolled_at: string
  lesson_id: string | null
  progress_percent: number | string | null
  score: number | string | null
  completed_at: string | null
  last_activity_at?: string | null
}

/** A learner with no activity for this many days is flagged as inactive. */
export const INACTIVE_AFTER_DAYS = 14

export type LearnerStatus = 'not_started' | 'active' | 'inactive' | 'completed'
export type LearnerFilter = LearnerStatus | 'all'
export type LearnerSort = 'progress' | 'activity'

export interface StatsLesson {
  id: string
  title: string
  kind: string
}

export interface LearnerLessonDetail {
  lessonId: string
  title: string
  kind: string
  percent: number
  score: number | null
  done: boolean
  at: string | null
}

export interface LearnerSummary {
  userId: string
  name: string
  enrolledAt: string
  completedLessons: number
  percent: number
  averageScore: number | null
  status: LearnerStatus
  lastActivityAt: string | null
  lessons: LearnerLessonDetail[]
}

export interface LessonStat {
  lessonId: string
  title: string
  kind: string
  completedCount: number
  completionRate: number
  averageScore: number | null
  /** Completion-rate points lost versus the previous lesson (never negative); null for the first lesson. */
  dropOffFromPrevious: number | null
}

export interface CourseStats {
  enrolledCount: number
  averageProgress: number
  fullyCompletedCount: number
  learners: LearnerSummary[]
  lessons: LessonStat[]
  /** The lesson with the largest positive drop-off, or null when nobody drops. */
  biggestDropLessonId: string | null
}

function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

/** Per-learner and per-lesson aggregates from the flat rows of `course_progress_rows`. */
export function summarizeCourseStats(
  rows: ProgressRow[],
  lessons: StatsLesson[],
  now: Date = new Date(),
): CourseStats {
  const lessonIds = new Set(lessons.map(l => l.id))

  const learnersById = new Map<
    string,
    {
      name: string
      enrolledAt: string
      byLesson: Map<string, { percent: number; score: number | null; done: boolean; at: string | null }>
    }
  >()
  for (const r of rows) {
    let learner = learnersById.get(r.user_id)
    if (!learner) {
      learner = { name: r.full_name?.trim() || 'Apprenant', enrolledAt: r.enrolled_at, byLesson: new Map() }
      learnersById.set(r.user_id, learner)
    }
    if (r.lesson_id && lessonIds.has(r.lesson_id)) {
      const percent = Math.max(0, Math.min(100, num(r.progress_percent) ?? (r.completed_at ? 100 : 0)))
      learner.byLesson.set(r.lesson_id, {
        percent,
        score: num(r.score),
        done: percent >= 100 || Boolean(r.completed_at),
        at: r.last_activity_at ?? r.completed_at ?? null,
      })
    }
  }

  const learners: LearnerSummary[] = [...learnersById.entries()].map(([userId, l]) => {
    const entries = [...l.byLesson.values()]
    const percentSum = entries.reduce((sum, e) => sum + e.percent, 0)
    const completedLessons = entries.filter(e => e.done).length
    const lastActivityAt = latest(entries.map(e => e.at))
    return {
      userId,
      name: l.name,
      enrolledAt: l.enrolledAt,
      completedLessons,
      percent: lessons.length === 0 ? 0 : Math.round(percentSum / lessons.length),
      averageScore: mean(entries.flatMap(e => (e.score === null ? [] : [e.score]))),
      status: learnerStatus(entries.length, completedLessons, lessons.length, lastActivityAt, now),
      lastActivityAt,
      lessons: lessons.map(lesson => {
        const e = l.byLesson.get(lesson.id)
        return {
          lessonId: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          percent: e?.percent ?? 0,
          score: e?.score ?? null,
          done: e?.done ?? false,
          at: e?.at ?? null,
        }
      }),
    }
  })
  learners.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name, 'fr'))

  const enrolledCount = learners.length
  const lessonStats: LessonStat[] = lessons.map(lesson => {
    const entries = [...learnersById.values()].flatMap(l => {
      const e = l.byLesson.get(lesson.id)
      return e ? [e] : []
    })
    const completedCount = entries.filter(e => e.done).length
    return {
      lessonId: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      completedCount,
      completionRate: enrolledCount === 0 ? 0 : Math.round((completedCount / enrolledCount) * 100),
      averageScore: mean(entries.flatMap(e => (e.score === null ? [] : [e.score]))),
      dropOffFromPrevious: null,
    }
  })
  let biggestDropLessonId: string | null = null
  let biggestDrop = 0
  for (let i = 1; i < lessonStats.length; i++) {
    const drop = Math.max(0, lessonStats[i - 1].completionRate - lessonStats[i].completionRate)
    lessonStats[i].dropOffFromPrevious = drop
    if (drop > biggestDrop) {
      biggestDrop = drop
      biggestDropLessonId = lessonStats[i].lessonId
    }
  }

  return {
    enrolledCount,
    averageProgress:
      enrolledCount === 0 ? 0 : Math.round(learners.reduce((sum, l) => sum + l.percent, 0) / enrolledCount),
    fullyCompletedCount:
      lessons.length === 0 ? 0 : learners.filter(l => l.completedLessons === lessons.length).length,
    learners,
    lessons: lessonStats,
    biggestDropLessonId,
  }
}

function latest(dates: (string | null)[]): string | null {
  let best: string | null = null
  for (const d of dates) {
    if (d && (best === null || Date.parse(d) > Date.parse(best))) best = d
  }
  return best
}

function learnerStatus(
  touchedLessons: number,
  completedLessons: number,
  totalLessons: number,
  lastActivityAt: string | null,
  now: Date,
): LearnerStatus {
  if (totalLessons > 0 && completedLessons === totalLessons) return 'completed'
  if (touchedLessons === 0) return 'not_started'
  if (lastActivityAt === null) return 'active'
  const idleDays = (now.getTime() - Date.parse(lastActivityAt)) / 86_400_000
  return idleDays > INACTIVE_AFTER_DAYS ? 'inactive' : 'active'
}

/** Status filter plus sort: 'activity' puts never-active, then longest-idle learners first. */
export function filterLearners(
  learners: LearnerSummary[],
  filter: LearnerFilter,
  sort: LearnerSort,
): LearnerSummary[] {
  const kept = filter === 'all' ? [...learners] : learners.filter(l => l.status === filter)
  const byName = (a: LearnerSummary, b: LearnerSummary) => a.name.localeCompare(b.name, 'fr')
  if (sort === 'progress') return kept.sort((a, b) => a.percent - b.percent || byName(a, b))
  const ts = (l: LearnerSummary) => (l.lastActivityAt ? Date.parse(l.lastActivityAt) : -Infinity)
  return kept.sort((a, b) => ts(a) - ts(b) || byName(a, b))
}
