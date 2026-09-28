import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlusCircle, ShieldCheck, MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { primaryLinkClass, secondaryLinkClass } from '@/components/courses/styles'
import { createClient } from '@/lib/supabase-server'
import { getMyCourses, isAdmin } from '@/lib/courses/queries'
import { LEVEL_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { DIALECTS } from '@/lib/dialect'

export const dynamic = 'force-dynamic'

export default async function TeachPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/teach')

  const [courses, admin] = await Promise.all([getMyCourses(supabase, user.id), isAdmin(supabase)])

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Espace enseignant"
        title="Mes cours"
        subtitle="Créez des cours, organisez vos leçons et publiez-les pour toute la communauté."
      />

      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/teach/new" className={primaryLinkClass}>
          <PlusCircle className="w-4 h-4" />
          Nouveau cours
        </Link>
        <Link href="/teach/reviews" className={secondaryLinkClass}>
          <MessageSquare className="w-4 h-4" />
          Correction des devoirs
        </Link>
        {admin && (
          <Link href="/admin/reports" className={secondaryLinkClass}>
            <ShieldCheck className="w-4 h-4" />
            Modération
          </Link>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
          Vous n’avez pas encore créé de cours.
        </div>
      ) : (
        <ul className="space-y-3">
          {courses.map(course => (
            <li
              key={course.id}
              className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-0.5 ${STATUS_STYLES[course.status]}`}>
                    {STATUS_LABELS[course.status]}
                  </span>
                  <span className="text-muted-foreground">
                    {LEVEL_LABELS[course.level]} · {DIALECTS[course.dialect].name}
                  </span>
                </div>
                <h2 className="font-heading font-semibold truncate">{course.title}</h2>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/teach/${course.id}`} className={primaryLinkClass}>
                  Modifier
                </Link>
                {course.status === 'published' && (
                  <Link href={`/courses/${course.slug}`} className={secondaryLinkClass}>
                    Voir
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
