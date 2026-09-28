'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { saveLessonContent, updateLesson } from '@/lib/courses/mutations'
import type { Lesson } from '@/lib/courses/types'
import type { QuizAnswerKey, QuizQuestionDraft } from '@/lib/courses/quiz'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { AudioUploader } from '@/components/courses/AudioUploader'
import { QuizBuilder } from '@/components/courses/QuizBuilder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Props {
  courseId: string
  courseOwnerId: string
  lesson: Lesson
  initialBody: string
  initialAudioPath: string | null
  initialAudioUrl: string | null
  initialQuizQuestions: QuizQuestionDraft[]
  initialQuizKeys: Map<string, QuizAnswerKey>
  readOnly: boolean
}

export function LessonEditor({
  courseId,
  courseOwnerId,
  lesson,
  initialBody,
  initialAudioPath,
  initialAudioUrl,
  initialQuizQuestions,
  initialQuizKeys,
  readOnly,
}: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [title, setTitle] = useState(lesson.title)
  const [kind, setKind] = useState<Lesson['kind']>(lesson.kind)
  const [isPreview, setIsPreview] = useState(lesson.is_preview)
  const [body, setBody] = useState(initialBody)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const meta = await updateLesson(supabase, lesson.id, { title, is_preview: isPreview, kind })
    if (meta.error) {
      setSaving(false)
      setError(meta.error)
      return
    }
    const content = await saveLessonContent(supabase, lesson.id, body)
    setSaving(false)
    if (content.error) {
      setError(content.error)
      return
    }
    setSaved(true)
    router.refresh()
  }

  const tabClass = (active: boolean) =>
    cn(
      'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
      active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="space-y-6">
      <Link
        href={`/teach/${courseId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au plan du cours
      </Link>

      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="lesson-title">Titre de la leçon</label>
            <Input
              id="lesson-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="lesson-kind">Format de la leçon</label>
            <select
              id="lesson-kind"
              value={kind}
              onChange={e => setKind(e.target.value as Lesson['kind'])}
              disabled={readOnly}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="text">Texte (cours écrit avec mise en forme)</option>
              <option value="audio">Audio (enregistrement avec transcription ou notes)</option>
              <option value="quiz">Quiz QCM (questions à choix multiples)</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={isPreview}
            onChange={e => setIsPreview(e.target.checked)}
            disabled={readOnly}
          />
          <span className="text-sm">
            Leçon d’aperçu : visible par tous, même sans inscription (utile pour donner envie de suivre le cours)
          </span>
        </label>
      </div>

      {/* Audio upload section */}
      {kind === 'audio' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Enregistrement audio de la leçon</h3>
          <AudioUploader
            courseOwnerId={courseOwnerId}
            lessonId={lesson.id}
            audioPath={initialAudioPath}
            signedAudioUrl={initialAudioUrl}
            disabled={readOnly}
            onUpdated={() => router.refresh()}
          />
        </div>
      )}

      {/* Quiz builder section */}
      {kind === 'quiz' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-heading font-semibold">Questions du Quiz</h3>
            <p className="text-xs text-muted-foreground">Note de passage minimale : 70 %</p>
          </div>
          <QuizBuilder
            lessonId={lesson.id}
            initialQuestions={initialQuizQuestions}
            initialKeys={initialQuizKeys}
            readOnly={readOnly}
            onSaved={() => router.refresh()}
          />
        </div>
      )}

      {/* Markdown editor (written text, transcription, or quiz instructions) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium" htmlFor="lesson-body">
            {kind === 'audio'
              ? 'Transcription / Notes de cours (Markdown)'
              : kind === 'quiz'
              ? 'Instructions du quiz (Markdown)'
              : 'Contenu du cours (Markdown)'}
          </label>
          <div className="flex gap-1 lg:hidden">
            <button type="button" className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
              Écrire
            </button>
            <button type="button" className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
              Aperçu
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className={cn('space-y-2', tab === 'preview' && 'hidden lg:block')}>
            <Textarea
              id="lesson-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={kind === 'quiz' ? 6 : 16}
              disabled={readOnly}
              className={cn('font-mono', kind === 'quiz' ? 'min-h-[140px]' : 'min-h-[320px]')}
              placeholder={
                kind === 'audio'
                  ? 'Ajoutez la transcription ou le vocabulaire lié à l’audio…'
                  : kind === 'quiz'
                  ? 'Consignes optionnelles pour les apprenants avant de commencer…'
                  : 'Écrivez votre leçon ici…'
              }
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Aide à la mise en forme</summary>
              <ul className="mt-2 space-y-1">
                <li>{'# Titre, ## Sous-titre, ### Petit titre'}</li>
                <li>{'**gras**, *italique*, `code`'}</li>
                <li>{'[texte du lien](https://exemple.com)'}</li>
                <li>{'- liste à puces, 1. liste numérotée'}</li>
                <li>{'> citation'}</li>
                <li>{'--- ligne de séparation'}</li>
              </ul>
            </details>
          </div>
          <div className={cn('space-y-2', tab === 'write' && 'hidden lg:block')}>
            <p className="text-sm font-medium text-muted-foreground">Aperçu du rendu</p>
            <div className="bg-card border border-border rounded-xl p-5 min-h-[140px]">
              {body.trim() ? (
                <LessonMarkdown source={body} />
              ) : (
                <p className="text-sm text-muted-foreground">Rien à afficher pour l’instant.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!readOnly && (
        <Button size="lg" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer les modifications'}
        </Button>
      )}
    </div>
  )
}
