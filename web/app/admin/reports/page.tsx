import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { ReportActions, RestoreButton } from '@/components/courses/ModerationActions'
import { createClient } from '@/lib/supabase-server'
import { getOpenReports, getSuspendedCourses, isAdmin } from '@/lib/courses/queries'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/admin/reports')
  if (!(await isAdmin(supabase))) notFound()

  const [reports, suspended] = await Promise.all([getOpenReports(supabase), getSuspendedCourses(supabase)])

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-10">
      <PageHeader badge="Administration" title="Modération des cours" subtitle="Signalements ouverts et cours suspendus." />

      <section className="space-y-3">
        <h2 className="font-heading font-bold text-lg">Signalements ouverts ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun signalement en attente.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map(report => (
              <li key={report.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {report.course ? (
                    <Link href={`/courses/${report.course.slug}`} className="font-heading font-semibold hover:text-primary">
                      {report.course.title}
                    </Link>
                  ) : (
                    <span className="font-heading font-semibold">Cours supprimé</span>
                  )}
                  {report.course && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[report.course.status]}`}>
                      {STATUS_LABELS[report.course.status]}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{report.reason}</p>
                <ReportActions
                  reportId={report.id}
                  courseId={report.course?.id ?? ''}
                  canSuspend={report.course !== null && report.course.status !== 'suspended'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-bold text-lg">Cours suspendus ({suspended.length})</h2>
        {suspended.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun cours suspendu.</p>
        ) : (
          <ul className="space-y-3">
            {suspended.map(course => (
              <li
                key={course.id}
                className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center justify-between gap-3"
              >
                <Link href={`/courses/${course.slug}`} className="font-heading font-semibold hover:text-primary">
                  {course.title}
                </Link>
                <RestoreButton courseId={course.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
