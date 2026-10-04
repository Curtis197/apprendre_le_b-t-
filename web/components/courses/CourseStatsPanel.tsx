import Link from 'next/link'
import type { CourseStats } from '@/lib/courses/stats'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
    </div>
  )
}

/** Summary tiles on the builder page; the detail lives on /teach/[courseId]/learners. */
export function CourseStatsPanel({ stats, courseId }: { stats: CourseStats; courseId: string }) {
  const inactiveCount = stats.learners.filter(l => l.status === 'inactive').length
  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-4" aria-labelledby="course-stats-title">
      <h2 id="course-stats-title" className="font-heading font-bold text-base">
        Suivi des apprenants
      </h2>

      {stats.enrolledCount === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l’instant.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Inscrits" value={String(stats.enrolledCount)} />
            <Tile label="Progression moyenne" value={`${stats.averageProgress} %`} />
            <Tile label="Cours terminé" value={String(stats.fullyCompletedCount)} />
            <Tile label="Inactifs" value={String(inactiveCount)} />
          </div>
          <Link
            href={`/teach/${courseId}/learners`}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Voir le suivi détaillé →
          </Link>
        </>
      )}
    </section>
  )
}
