import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { CourseCard } from '@/components/courses/CourseCard'
import { createClient } from '@/lib/supabase-server'
import { getPublishedCourses } from '@/lib/courses/queries'
import { LEVELS, LEVEL_LABELS, isDialect, isLevel } from '@/lib/courses/labels'
import { DIALECTS, DIALECT_KEYS } from '@/lib/dialect'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cours de bhété',
  description:
    'Les premiers cours pour apprendre le bhété (bété) de Côte d’Ivoire sont en préparation : leçons créées par la communauté, gratuites et accessibles sur mobile.',
  alternates: { canonical: '/courses' },
}

interface Props {
  searchParams: Promise<{ dialect?: string; level?: string }>
}

function filterHref(dialect: string | null, level: string | null) {
  const params = new URLSearchParams()
  if (dialect) params.set('dialect', dialect)
  if (level) params.set('level', level)
  const query = params.toString()
  return query ? `/courses?${query}` : '/courses'
}

const pill = (active: boolean) =>
  cn(
    'rounded-full px-4 py-2 text-sm whitespace-nowrap border transition-colors shrink-0',
    active ? 'bg-primary text-white border-primary' : 'bg-muted border-transparent hover:border-primary',
  )

export default async function CoursesPage({ searchParams }: Props) {
  const params = await searchParams
  const dialect = isDialect(params.dialect) ? params.dialect : null
  const level = isLevel(params.level) ? params.level : null

  const supabase = await createClient()
  const courses = await getPublishedCourses(supabase, { dialect, level })

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Cours"
        title="Apprendre le bhété"
        subtitle="Les premiers cours sont en préparation. Ils seront créés par des locuteurs et des enseignants de la communauté."
      />

      <div className="flex flex-col gap-3 mb-8">
        <div className="flex overflow-x-auto gap-2 pb-1" aria-label="Filtrer par dialecte">
          <Link href={filterHref(null, level)} className={pill(dialect === null)}>
            Tous les dialectes
          </Link>
          {DIALECT_KEYS.map(key => (
            <Link key={key} href={filterHref(key, level)} className={pill(dialect === key)}>
              {DIALECTS[key].name}
            </Link>
          ))}
        </div>
        <div className="flex overflow-x-auto gap-2 pb-1" aria-label="Filtrer par niveau">
          <Link href={filterHref(dialect, null)} className={pill(level === null)}>
            Tous les niveaux
          </Link>
          {LEVELS.map(key => (
            <Link key={key} href={filterHref(dialect, key)} className={pill(level === key)}>
              {LEVEL_LABELS[key]}
            </Link>
          ))}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <p className="text-muted-foreground">
            {dialect || level
              ? 'Aucun cours ne correspond à ces filtres pour le moment.'
              : 'Les premiers cours arrivent. Vous parlez bhété et voulez en créer un ?'}
          </p>
          <Link
            href="/teach"
            className="inline-flex items-center bg-primary text-white font-semibold px-6 h-10 rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            Devenir enseignant
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  )
}
