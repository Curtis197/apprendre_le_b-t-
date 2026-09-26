'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { saveLessonContent, updateLesson } from '@/lib/courses/mutations'
import type { Lesson } from '@/lib/courses/types'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Props {
  courseId: string
  lesson: Lesson
  initialBody: string
  readOnly: boolean
}

export function LessonEditor({ courseId, lesson, initialBody, readOnly }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [title, setTitle] = useState(lesson.title)
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
    const meta = await updateLesson(supabase, lesson.id, { title, is_preview: isPreview })
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

      <div className="flex gap-1 lg:hidden">
        <button type="button" className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
          Écrire
        </button>
        <button type="button" className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
          Aperçu
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn('space-y-2', tab === 'preview' && 'hidden lg:block')}>
          <label className="text-sm font-medium" htmlFor="lesson-body">Contenu</label>
          <Textarea
            id="lesson-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={18}
            disabled={readOnly}
            className="font-mono min-h-[360px]"
            placeholder="Écrivez votre leçon ici…"
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
              <li>Les images, tableaux et le HTML ne sont pas pris en charge.</li>
            </ul>
          </details>
        </div>
        <div className={cn('space-y-2', tab === 'write' && 'hidden lg:block')}>
          <p className="text-sm font-medium">Aperçu</p>
          <div className="bg-card border border-border rounded-xl p-5 min-h-[200px]">
            {body.trim() ? (
              <LessonMarkdown source={body} />
            ) : (
              <p className="text-sm text-muted-foreground">Rien à afficher pour l’instant.</p>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!readOnly && (
        <Button size="lg" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer la leçon'}
        </Button>
      )}
    </div>
  )
}
