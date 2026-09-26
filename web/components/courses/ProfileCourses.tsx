import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getMyCourses, getMyEnrollments } from '@/lib/courses/queries'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { primaryLinkClass } from './styles'

export async function ProfileCourses() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [mine, learning] = await Promise.all([
    getMyCourses(supabase, user.id),
    getMyEnrollments(supabase, user.id),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 pb-10 space-y-8">
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-bold text-base">Mes formations</h2>
        {learning.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Vous n’êtes inscrit à aucun cours.{' '}
            <Link href="/courses" className="text-primary underline underline-offset-2">
              Parcourir les cours
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {learning.map(({ course, progress }) => (
              <li key={course.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/courses/${course.slug}`} className="text-sm font-medium hover:text-primary truncate">
                    {course.title}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading font-bold text-base">Mes cours</h2>
          <Link href="/teach" className={primaryLinkClass}>
            Espace enseignant
          </Link>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Vous n’avez pas encore créé de cours.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map(course => (
              <li key={course.id} className="flex items-center justify-between gap-3">
                <Link href={`/teach/${course.id}`} className="text-sm font-medium hover:text-primary truncate">
                  {course.title}
                </Link>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_STYLES[course.status]}`}>
                  {STATUS_LABELS[course.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
