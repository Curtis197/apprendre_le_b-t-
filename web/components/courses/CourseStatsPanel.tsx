import { KIND_LABELS } from '@/lib/courses/labels'
import type { LessonKind } from '@/lib/courses/types'
import type { CourseStats } from '@/lib/courses/stats'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
    </div>
  )
}

export function CourseStatsPanel({ stats }: { stats: CourseStats }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-6" aria-labelledby="course-stats-title">
      <h2 id="course-stats-title" className="font-heading font-bold text-base">
        Suivi des apprenants
      </h2>

      {stats.enrolledCount === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l’instant.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Inscrits" value={String(stats.enrolledCount)} />
            <Tile label="Progression moyenne" value={`${stats.averageProgress} %`} />
            <Tile label="Cours terminé" value={String(stats.fullyCompletedCount)} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Par leçon</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Leçon</th>
                    <th className="py-2 pr-3 font-medium">Terminée par</th>
                    <th className="py-2 font-medium">Score moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.lessons.map(lesson => (
                    <tr key={lesson.lessonId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {lesson.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {KIND_LABELS[lesson.kind as LessonKind] ?? lesson.kind}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {lesson.completedCount} / {stats.enrolledCount} ({lesson.completionRate} %)
                      </td>
                      <td className="py-2">{lesson.averageScore === null ? '—' : `${lesson.averageScore} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Par apprenant (les moins avancés d’abord)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Apprenant</th>
                    <th className="py-2 pr-3 font-medium">Progression</th>
                    <th className="py-2 pr-3 font-medium">Leçons terminées</th>
                    <th className="py-2 font-medium">Score moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.learners.map(learner => (
                    <tr key={learner.userId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{learner.name}</td>
                      <td className="py-2 pr-3">{learner.percent} %</td>
                      <td className="py-2 pr-3">{learner.completedLessons}</td>
                      <td className="py-2">{learner.averageScore === null ? '—' : `${learner.averageScore} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
