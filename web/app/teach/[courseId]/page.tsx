import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CourseBuilder } from '@/components/courses/CourseBuilder'
import { CourseForm } from '@/components/courses/CourseForm'
import { CourseStatusPanel } from '@/components/courses/CourseStatusPanel'
import { CourseStatsPanel } from '@/components/courses/CourseStatsPanel'
import { createClient } from '@/lib/supabase-server'
import { getCourseById, getCourseOutline, getCourseProgressRows } from '@/lib/courses/queries'
import { flattenLessons, publishBlocker } from '@/lib/courses/outline'
import { summarizeCourseStats } from '@/lib/courses/stats'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string }>
}

export default async function BuilderPage({ params }: Props) {
  const { courseId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const outline = await getCourseOutline(supabase, course.id)
  const lessons = flattenLessons(outline)
  const stats = summarizeCourseStats(
    await getCourseProgressRows(supabase, course.id),
    lessons.map(l => ({ id: l.id, title: l.title, kind: l.kind })),
  )
  const readOnly = course.status === 'suspended'

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-8">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Mes cours
      </Link>

      <h1 className="font-heading text-3xl font-bold">{course.title}</h1>

      <CourseStatusPanel course={course} blocker={publishBlocker(outline)} />

      <CourseStatsPanel stats={stats} />

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-bold text-base">Informations</h2>
        <CourseForm mode="edit" course={course} disabled={readOnly} />
      </div>

      <CourseBuilder course={course} outline={outline} readOnly={readOnly} />
    </div>
  )
}
