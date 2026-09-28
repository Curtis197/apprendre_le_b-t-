import { notFound, redirect } from 'next/navigation'
import { LessonEditor } from '@/components/courses/LessonEditor'
import { createClient } from '@/lib/supabase-server'
import {
  getCourseById,
  getCourseOutline,
  getLessonAudioPath,
  getLessonAudioUrl,
  getLessonContent,
  getQuizForLesson,
  getTeacherQuizKeys,
} from '@/lib/courses/queries'
import { flattenLessons } from '@/lib/courses/outline'
import type { QuizAnswerKey, QuizQuestionDraft } from '@/lib/courses/quiz'

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

  // Prefetch audio assets
  const audioPath = await getLessonAudioPath(supabase, lesson.id)
  const signedAudioUrl = audioPath ? await getLessonAudioUrl(supabase, audioPath) : null

  // Prefetch quiz questions and answer keys
  const quizQuestions = await getQuizForLesson(supabase, lesson.id)
  const questionIds = quizQuestions.map(q => q.id)
  const quizKeys: Map<string, QuizAnswerKey> =
    questionIds.length > 0 ? await getTeacherQuizKeys(supabase, questionIds) : new Map()

  const drafts: QuizQuestionDraft[] = quizQuestions.map(q => {
    const key = quizKeys.get(q.id)
    const correctOptionIndices = (key?.correct_option_ids ?? [])
      .map(id => q.options.findIndex(opt => opt.id === id))
      .filter(idx => idx !== -1)

    return {
      id: q.id,
      prompt: q.prompt,
      audio_path: q.audio_path,
      position: q.position,
      options: q.options.map(opt => ({ id: opt.id, text: opt.text, position: opt.position })),
      correctOptionIndices: correctOptionIndices.length > 0 ? correctOptionIndices : [0],
      explanation: key?.explanation ?? '',
    }
  })

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-10 py-10">
      <LessonEditor
        courseId={course.id}
        courseOwnerId={course.owner_id}
        lesson={lesson}
        initialBody={body}
        initialAudioPath={audioPath}
        initialAudioUrl={signedAudioUrl}
        initialQuizQuestions={drafts}
        initialQuizKeys={quizKeys}
        readOnly={course.status === 'suspended'}
      />
    </div>
  )
}
