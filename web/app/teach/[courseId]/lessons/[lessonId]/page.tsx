import { notFound, redirect } from 'next/navigation'
import { LessonEditor } from '@/components/courses/LessonEditor'
import { createClient } from '@/lib/supabase-server'
import { getCourseById, getCourseOutline, getLessonContent } from '@/lib/courses/queries'
import { flattenLessons } from '@/lib/courses/outline'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonEditorPage({ params }: Props) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}/lessons/${lessonId}`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const outline = await getCourseOutline(supabase, course.id)
  const lesson = flattenLessons(outline).find(l => l.id === lessonId)
  if (!lesson) notFound()

  const body = (await getLessonContent(supabase, lesson.id)) ?? ''

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-10 py-10">
      <LessonEditor
        courseId={course.id}
        lesson={lesson}
        initialBody={body}
        readOnly={course.status === 'suspended'}
      />
    </div>
  )
}
