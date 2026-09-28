import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import {
  getCompletedLessonIds,
  getCourseBySlug,
  getCourseOutline,
  getLessonAudioPath,
  getLessonAudioUrl,
  getLessonContent,
  getMediaAssetForLesson,
  getSignedMuxPlaybackToken,
  getQuizForLesson,
  isEnrolled,
} from '@/lib/courses/queries'
import { flattenLessons, nextLessonId } from '@/lib/courses/outline'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { LessonOutline } from '@/components/courses/LessonOutline'
import { CompleteButton } from '@/components/courses/CompleteButton'
import { AudioPlayer } from '@/components/courses/AudioPlayer'
import { VideoPlayer } from '@/components/courses/VideoPlayer'
import { QuizPlayer } from '@/components/courses/QuizPlayer'
import { primaryLinkClass, secondaryLinkClass } from '@/components/courses/styles'

export const dynamic = 'force-dynamic'

const getLessonData = cache(async (slug: string, lessonId: string) => {
  const supabase = await createClient()
  const course = await getCourseBySlug(supabase, slug)
  if (!course) return null
  const outline = await getCourseOutline(supabase, course.id)
  const flat = flattenLessons(outline)
  const lesson = flat.find(l => l.id === lessonId)
  if (!lesson) return null
  return { course, outline, flat, lesson }
})

interface Props {
  params: Promise<{ slug: string; lessonId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lessonId } = await params
  const data = await getLessonData(slug, lessonId)
  if (!data) return { title: 'Leçon introuvable', robots: { index: false } }
  // Only preview lessons of published courses are public and indexable.
  const indexable = data.course.status === 'published' && data.lesson.is_preview
  return {
    title: `${data.lesson.title} — ${data.course.title}`,
    alternates: { canonical: `/courses/${slug}/learn/${lessonId}` },
    robots: { index: indexable, follow: true },
  }
}

export default async function LessonPage({ params }: Props) {
  const { slug, lessonId } = await params
  const data = await getLessonData(slug, lessonId)
  if (!data) notFound()
  const { course, outline, flat, lesson } = data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // RLS withholds the body from anyone without access; send them to sign in or to the course page.
  const body = await getLessonContent(supabase, lesson.id)
  if (body === null) {
    redirect(user ? `/courses/${slug}` : `/auth?next=${encodeURIComponent(`/courses/${slug}/learn/${lessonId}`)}`)
  }

  const isOwner = user?.id === course.owner_id
  const enrolled = user ? await isEnrolled(supabase, user.id, course.id) : false
  const hasFullAccess = enrolled || isOwner
  const completed = user ? await getCompletedLessonIds(supabase, user.id, flat.map(l => l.id)) : []

  // Prefetch audio, video, and quiz data if applicable
  const audioPath = await getLessonAudioPath(supabase, lesson.id)
  const signedAudioUrl = audioPath ? await getLessonAudioUrl(supabase, audioPath) : null

  const mediaAsset = lesson.kind === 'video' ? await getMediaAssetForLesson(supabase, lesson.id) : null
  const signedPlaybackToken = mediaAsset?.mux_playback_id
    ? await getSignedMuxPlaybackToken(mediaAsset.mux_playback_id)
    : null

  const quizQuestions = lesson.kind === 'quiz' ? await getQuizForLesson(supabase, lesson.id) : []

  const next = flat.find(l => l.id === nextLessonId(flat, lesson.id))
  const nextHref = next && (hasFullAccess || next.is_preview) ? `/courses/${slug}/learn/${next.id}` : null

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 py-8 grid lg:grid-cols-[280px_1fr] gap-8">
      <aside className="order-2 lg:order-1 space-y-4">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {course.title}
        </Link>
        <LessonOutline
          slug={slug}
          outline={outline}
          currentLessonId={lesson.id}
          completedIds={completed}
          hasFullAccess={hasFullAccess}
        />
      </aside>

      <article className="order-1 lg:order-2 space-y-8 min-w-0">
        <h1 className="font-heading text-3xl font-bold">{lesson.title}</h1>

        {lesson.kind === 'text' && (
          <div className="space-y-6">
            {signedAudioUrl && (
              <AudioPlayer src={signedAudioUrl} title="Version audio de la leçon" />
            )}
            <LessonMarkdown source={body} />
          </div>
        )}

        {lesson.kind === 'audio' && (
          <div className="space-y-6">
            {signedAudioUrl ? (
              <AudioPlayer src={signedAudioUrl} title={lesson.title} />
            ) : (
              <div className="p-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
                L’enregistrement audio de cette leçon sera bientôt disponible.
              </div>
            )}
            {body.trim() && <LessonMarkdown source={body} />}
          </div>
        )}

        {lesson.kind === 'video' && (
          <div className="space-y-6">
            {mediaAsset && mediaAsset.status === 'ready' && mediaAsset.mux_playback_id ? (
              <VideoPlayer
                playbackId={mediaAsset.mux_playback_id}
                signedToken={signedPlaybackToken}
                title={lesson.title}
              />
            ) : mediaAsset && mediaAsset.status === 'processing' ? (
              <div className="p-8 border border-border rounded-xl text-center space-y-2 bg-card">
                <p className="font-semibold text-primary">Vidéo en cours de traitement…</p>
                <p className="text-xs text-muted-foreground">La vidéo sera disponible d’ici quelques minutes.</p>
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
                La vidéo de cette leçon n’a pas encore été versée.
              </div>
            )}
            {body.trim() && <LessonMarkdown source={body} />}
          </div>
        )}

        {lesson.kind === 'quiz' && (
          <div className="space-y-6">
            {body.trim() && <LessonMarkdown source={body} />}
            {quizQuestions.length > 0 ? (
              <QuizPlayer lessonId={lesson.id} questions={quizQuestions} />
            ) : (
              <div className="p-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
                Ce quiz n’a pas encore de questions enregistrées.
              </div>
            )}
          </div>
        )}

        {lesson.kind !== 'text' && lesson.kind !== 'audio' && lesson.kind !== 'quiz' && lesson.kind !== 'video' && (
          <p className="text-muted-foreground">Ce type de leçon sera bientôt disponible.</p>
        )}

        <div className="border-t border-border pt-6 flex flex-wrap items-start gap-4">
          {user ? (
            <CompleteButton lessonId={lesson.id} completed={completed.includes(lesson.id)} />
          ) : (
            <Link
              href={`/auth?next=${encodeURIComponent(`/courses/${slug}/learn/${lessonId}`)}`}
              className={secondaryLinkClass}
            >
              Connectez-vous pour suivre votre progression
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} className={primaryLinkClass}>
              Leçon suivante
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}
