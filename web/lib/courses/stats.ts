export interface ProgressRow {
  user_id: string
  full_name: string | null
  enrolled_at: string
  lesson_id: string | null
  progress_percent: number | string | null
  score: number | string | null
  completed_at: string | null
}

export interface StatsLesson {
  id: string
  title: string
  kind: string
}

export interface LearnerSummary {
  userId: string
  name: string
  enrolledAt: string
  completedLessons: number
  percent: number
  averageScore: number | null
}

export interface LessonStat {
  lessonId: string
  title: string
  kind: string
  completedCount: number
  completionRate: number
  averageScore: number | null
}

export interface CourseStats {
  enrolledCount: number
  averageProgress: number
  fullyCompletedCount: number
  learners: LearnerSummary[]
  lessons: LessonStat[]
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
export function summarizeCourseStats(rows: ProgressRow[], lessons: StatsLesson[]): CourseStats {
  const lessonIds = new Set(lessons.map(l => l.id))

  const learnersById = new Map<
    string,
    {
      name: string
      enrolledAt: string
      byLesson: Map<string, { percent: number; score: number | null; done: boolean }>
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
      })
    }
  }

  const learners: LearnerSummary[] = [...learnersById.entries()].map(([userId, l]) => {
    const entries = [...l.byLesson.values()]
    const percentSum = entries.reduce((sum, e) => sum + e.percent, 0)
    return {
      userId,
      name: l.name,
      enrolledAt: l.enrolledAt,
      completedLessons: entries.filter(e => e.done).length,
      percent: lessons.length === 0 ? 0 : Math.round(percentSum / lessons.length),
      averageScore: mean(entries.flatMap(e => (e.score === null ? [] : [e.score]))),
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
    }
  })

  return {
    enrolledCount,
    averageProgress:
      enrolledCount === 0 ? 0 : Math.round(learners.reduce((sum, l) => sum + l.percent, 0) / enrolledCount),
    fullyCompletedCount:
      lessons.length === 0 ? 0 : learners.filter(l => l.completedLessons === lessons.length).length,
    learners,
    lessons: lessonStats,
  }
}
