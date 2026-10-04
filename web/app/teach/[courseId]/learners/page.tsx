import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { LearnerStatusBadge, formatActivity } from '@/components/courses/LearnerStatusBadge'
import { LessonFunnel } from '@/components/courses/LessonFunnel'
import { createClient } from '@/lib/supabase-server'
import { getCourseById, getCourseOutline, getCourseProgressRows } from '@/lib/courses/queries'
import { flattenLessons } from '@/lib/courses/outline'
import { LEARNER_STATUS_LABELS } from '@/lib/courses/labels'
import {
  filterLearners,
  summarizeCourseStats,
  type LearnerFilter,
  type LearnerSort,
} from '@/lib/courses/stats'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ status?: string; sort?: string }>
}

const FILTERS: LearnerFilter[] = ['all', 'inactive', 'not_started', 'active', 'completed']

function parseFilter(value: string | undefined): LearnerFilter {
  return FILTERS.includes(value as LearnerFilter) ? (value as LearnerFilter) : 'all'
}

function parseSort(value: string | undefined): LearnerSort {
  return value === 'progress' ? 'progress' : 'activity'
}

export default async function LearnersPage({ params, searchParams }: Props) {
  const { courseId } = await params
  const query = await searchParams
  const filter = parseFilter(query.status)
  const sort = parseSort(query.sort)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}/learners`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const lessons = flattenLessons(await getCourseOutline(supabase, course.id))
  const stats = summarizeCourseStats(
    await getCourseProgressRows(supabase, course.id),
    lessons.map(l => ({ id: l.id, title: l.title, kind: l.kind })),
  )
  const counts = (status: LearnerFilter) =>
    status === 'all' ? stats.learners.length : stats.learners.filter(l => l.status === status).length
  const learners = filterLearners(stats.learners, filter, sort)
  const href = (status: LearnerFilter, nextSort: LearnerSort) =>
    `/teach/${course.id}/learners?status=${status}&sort=${nextSort}`

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-8">
      <Link
        href={`/teach/${course.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {course.title}
      </Link>

      <h1 className="font-heading text-3xl font-bold">Suivi des apprenants</h1>

      <LessonFunnel stats={stats} />

      <section className="bg-card border border-border rounded-xl p-6 space-y-4" aria-labelledby="learners-title">
        <h2 id="learners-title" className="font-heading font-bold text-base">
          Apprenants
        </h2>

        <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
          {FILTERS.map(status => (
            <Link
              key={status}
              href={href(status, sort)}
              aria-current={status === filter ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                status === filter
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {status === 'all' ? 'Tous' : LEARNER_STATUS_LABELS[status]} ({counts(status)})
            </Link>
          ))}
        </nav>

        <p className="text-xs text-muted-foreground">
          Trier par :{' '}
          <Link href={href(filter, 'activity')} className={sort === 'activity' ? 'font-semibold underline' : 'underline'}>
            dernière activité
          </Link>
          {' · '}
          <Link href={href(filter, 'progress')} className={sort === 'progress' ? 'font-semibold underline' : 'underline'}>
            progression
          </Link>
        </p>

        {learners.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun apprenant ne correspond à ce filtre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Apprenant</th>
                  <th className="py-2 pr-3 font-medium">Statut</th>
                  <th className="py-2 pr-3 font-medium">Progression</th>
                  <th className="py-2 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {learners.map(learner => (
                  <tr key={learner.userId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/teach/${course.id}/learners/${learner.userId}`} className="font-medium hover:underline">
                        {learner.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <LearnerStatusBadge status={learner.status} />
                    </td>
                    <td className="py-2 pr-3">
                      {learner.percent} % · {learner.completedLessons}/{lessons.length}
                    </td>
                    <td className="py-2">{formatActivity(learner.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
