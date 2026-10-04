import { KIND_LABELS } from '@/lib/courses/labels'
import type { LessonKind } from '@/lib/courses/types'
import type { CourseStats } from '@/lib/courses/stats'

/** Completion funnel: one bar per lesson, the biggest drop-off flagged. */
export function LessonFunnel({ stats }: { stats: CourseStats }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-4" aria-labelledby="funnel-title">
      <h2 id="funnel-title" className="font-heading font-bold text-base">
        Où les apprenants décrochent
      </h2>
      {stats.lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ce cours n’a pas encore de leçon.</p>
      ) : (
        <ol className="space-y-3">
          {stats.lessons.map((lesson, index) => {
            const flagged = lesson.lessonId === stats.biggestDropLessonId
            return (
              <li key={lesson.lessonId} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    {index + 1}. {lesson.title}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {KIND_LABELS[lesson.kind as LessonKind] ?? lesson.kind}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lesson.completedCount} / {stats.enrolledCount} ({lesson.completionRate} %)
                    {lesson.averageScore !== null && ` · score ${lesson.averageScore} %`}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuenow={lesson.completionRate}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${lesson.title} : terminée par ${lesson.completionRate} % des inscrits`}
                >
                  <div
                    className={`h-full rounded-full ${flagged ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${lesson.completionRate}%` }}
                  />
                </div>
                {flagged && lesson.dropOffFromPrevious !== null && (
                  <p className="text-xs font-semibold text-destructive">
                    Plus forte baisse : −{lesson.dropOffFromPrevious} points par rapport à la leçon précédente
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
