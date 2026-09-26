import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import {
  getCompletedLessonIds,
  getCourseBySlug,
  getCourseOutline,
  isEnrolled,
} from '@/lib/courses/queries'
import { computeProgress, flattenLessons, resumeLessonId } from '@/lib/courses/outline'
import { LEVEL_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { DIALECTS } from '@/lib/dialect'
import { LessonOutline } from '@/components/courses/LessonOutline'
import { EnrollButton } from '@/components/courses/EnrollButton'
import { ReportCourseButton } from '@/components/courses/ReportCourseButton'
import { secondaryLinkClass } from '@/components/courses/styles'
import { JsonLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Shared by generateMetadata and the page so the course is fetched once per request.
const getCourseCached = cache(async (slug: string) => {
  const supabase = await createClient()
  return getCourseBySlug(supabase, slug)
})

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const course = await getCourseCached(slug)
  if (!course) return { title: 'Cours introuvable', robots: { index: false } }

  const description =
    course.summary.trim().slice(0, 160) || `Cours de bhété : ${course.title}, gratuit et créé par la communauté.`
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${slug}` },
    openGraph: { title: course.title, description, type: 'article', url: `/courses/${slug}` },
    robots: { index: course.status === 'published', follow: true },
  }
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params
  const course = await getCourseCached(slug)
  if (!course) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const outline = await getCourseOutline(supabase, course.id)
  const flat = flattenLessons(outline)
  const isOwner = user?.id === course.owner_id
  const enrolled = user ? await isEnrolled(supabase, user.id, course.id) : false
  const completed = user ? await getCompletedLessonIds(supabase, user.id, flat.map(l => l.id)) : []
  const progress = computeProgress(flat.map(l => l.id), completed)
  const resumeId = resumeLessonId(flat, completed)
  const startHref = resumeId ? `/courses/${course.slug}/learn/${resumeId}` : null

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-8">
      {course.status === 'published' && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: course.title,
            description: course.summary || course.title,
            url: `${SITE_URL}/courses/${course.slug}`,
            provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
            isAccessibleForFree: course.access === 'free',
          }}
        />
      )}

      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Tous les cours
      </Link>

      {isOwner && (
        <div className="bg-muted rounded-xl p-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[course.status]}`}>
            {STATUS_LABELS[course.status]}
          </span>
          <span className="flex-1 text-muted-foreground">
            {course.status === 'published'
              ? 'Vous êtes l’auteur de ce cours.'
              : 'Ce cours n’est pas visible dans le catalogue.'}
          </span>
          <Link href={`/teach/${course.id}`} className={secondaryLinkClass}>
            <Pencil className="w-4 h-4" />
            Modifier
          </Link>
        </div>
      )}

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5">{LEVEL_LABELS[course.level]}</span>
          <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">
            {DIALECTS[course.dialect].name}
          </span>
          <span className="rounded-full bg-secondary/10 text-secondary px-2.5 py-0.5">
            {course.access === 'free' ? 'Gratuit' : 'Payant'}
          </span>
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">{course.title}</h1>
        {course.summary && <p className="text-lg text-muted-foreground leading-relaxed">{course.summary}</p>}
        <p className="text-sm text-muted-foreground">
          {flat.length} leçon{flat.length > 1 ? 's' : ''}
          {enrolled && flat.length > 0 ? ` · ${progress.completed}/${progress.total} terminée${progress.completed > 1 ? 's' : ''}` : ''}
        </p>
        <EnrollButton
          courseId={course.id}
          slug={course.slug}
          isAuthed={user !== null}
          isOwner={isOwner}
          enrolled={enrolled}
          startHref={startHref}
          percent={progress.percent}
        />
      </header>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-heading font-bold text-lg mb-4">Au programme</h2>
        {outline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Le plan de ce cours n’est pas encore publié.</p>
        ) : (
          <LessonOutline
            slug={course.slug}
            outline={outline}
            completedIds={completed}
            hasFullAccess={enrolled || isOwner}
          />
        )}
      </section>

      {user && !isOwner && course.status === 'published' && <ReportCourseButton courseId={course.id} />}
    </div>
  )
}
