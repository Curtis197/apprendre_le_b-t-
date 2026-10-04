import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { LearnerStatusBadge, formatActivity } from '@/components/courses/LearnerStatusBadge'
import { primaryLinkClass } from '@/components/courses/styles'
import { createClient } from '@/lib/supabase-server'
import {
  getCourseById,
  getCourseOutline,
  getCourseProgressRows,
  getPendingSubmissionsForLearner,
} from '@/lib/courses/queries'
import { flattenLessons } from '@/lib/courses/outline'
import { KIND_LABELS } from '@/lib/courses/labels'
import { summarizeCourseStats } from '@/lib/courses/stats'
import type { LessonKind } from '@/lib/courses/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string; userId: string }>
}

export default async function LearnerDetailPage({ params }: Props) {
  const { courseId, userId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}/learners/${userId}`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const lessons = flattenLessons(await getCourseOutline(supabase, course.id))
  const stats = summarizeCourseStats(
    await getCourseProgressRows(supabase, course.id),
    lessons.map(l => ({ id: l.id, title: l.title, kind: l.kind })),
  )
  const learner = stats.learners.find(l => l.userId === userId)
  if (!learner) notFound()

  const pending = (await getPendingSubmissionsForLearner(supabase, course.id, userId)).map(p => ({
    ...p,
    title: lessons.find(l => l.id === p.lessonId)?.title ?? 'Leçon',
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-8">
      <Link
        href={`/teach/${course.id}/learners`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Suivi des apprenants
      </Link>

      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold">{learner.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <LearnerStatusBadge status={learner.status} />
          <span>Dernière activité : {formatActivity(learner.lastActivityAt)}</span>
          <span>
            {learner.percent} % · {learner.completedLessons}/{lessons.length} leçons
          </span>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="bg-card border border-border rounded-xl p-6 space-y-3" aria-labelledby="pending-title">
          <h2 id="pending-title" className="font-heading font-bold text-base">
            À corriger ({pending.length})
          </h2>
          <ul className="text-sm space-y-1">
            {pending.map(p => (
              <li key={p.id}>{p.title}</li>
            ))}
          </ul>
          <Link href="/teach/reviews" className={primaryLinkClass}>
            Ouvrir la correction des devoirs
          </Link>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl p-6 space-y-3" aria-labelledby="lessons-title">
        <h2 id="lessons-title" className="font-heading font-bold text-base">
          Leçon par leçon
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Leçon</th>
                <th className="py-2 pr-3 font-medium">Progression</th>
                <th className="py-2 pr-3 font-medium">Score</th>
                <th className="py-2 font-medium">Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {learner.lessons.map(l => (
                <tr key={l.lessonId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    {l.title}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {KIND_LABELS[l.kind as LessonKind] ?? l.kind}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{l.done ? 'Terminée' : `${l.percent} %`}</td>
                  <td className="py-2 pr-3">{l.score === null ? '—' : `${l.score} %`}</td>
                  <td className="py-2">{formatActivity(l.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
